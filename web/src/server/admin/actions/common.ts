import "server-only";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccess, getAdminSession } from "../session";
import type { AdminModule } from "../types";

/** Hasil server action admin — ditampilkan sebagai notice di UI. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const MODULE_LABEL: Record<AdminModule, string> = {
  overview: "Overview",
  members: "Members",
  activities: "Activities",
  venues: "Venues",
  products: "Products",
  orders: "Orders",
  content: "Konten & Galeri",
  settings: "Settings & Roles",
};

/**
 * Pastikan user login sebagai staf dengan izin "edit" di modul ini. Pesan error untuk UI;
 * RLS di database tetap menjadi penjaga utama.
 */
export async function requireEditor(module: AdminModule): Promise<{ userId: string; name: string } | { error: string }> {
  const session = await getAdminSession();
  if (session.mode === "demo") return { error: "Mode demo: sambungkan Supabase untuk menyimpan." };
  if (session.mode !== "live" || !canAccess(session, module, "edit")) return { error: `Role kamu tidak punya izin mengubah ${MODULE_LABEL[module]}.` };
  return { userId: session.userId, name: session.name };
}

/** Catat ke Log aktivitas admin (Settings). Gagal mencatat tidak membatalkan aksi. */
export async function audit(actorId: string, action: string, entityType: string, entityId?: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("admin_audit_log").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId ?? null });
}

/** Segarkan admin (sidebar, daftar) + halaman website yang terdampak. */
export function refreshPaths(...paths: (string | [string, "page" | "layout"])[]) {
  revalidatePath("/admin", "layout");
  for (const p of paths) {
    if (Array.isArray(p)) revalidatePath(p[0], p[1]);
    else revalidatePath(p);
  }
}

export const fail = (error: string): ActionResult => ({ ok: false, error });
export const done = (message: string): ActionResult => ({ ok: true, message });
