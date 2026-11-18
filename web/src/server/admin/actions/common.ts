import "server-only";
import { invalidateDataset } from "../dataset";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccess, getAdminSession } from "../session";
import type { AdminModule } from "../types";

/** Hasil server action admin — ditampilkan sebagai notice di UI. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Nomor HP tamu milik member → admin diminta konfirmasi dulu sebelum tamu ditautkan ke akunnya (activity & paket trip). */
export type ConfirmLinkResult = { ok: false; error: string; confirmLink: { memberId: string; name: string; memberCode: string } };
export const confirmLinkResult = (member: { id: string; fullName: string; memberCode: string }): ConfirmLinkResult => ({
  ok: false,
  error: "Konfirmasi penautan ke member dulu.",
  confirmLink: { memberId: member.id, name: member.fullName, memberCode: member.memberCode },
});

const MODULE_LABEL: Record<AdminModule, string> = {
  overview: "Overview",
  members: "Members",
  activities: "Activities",
  venues: "Venues",
  products: "Products",
  orders: "Orders",
  content: "Konten & Galeri",
  settings: "Settings & Roles",
  finance: "Keuangan",
};

/**
 * Pastikan user login sebagai staf dengan izin "edit" di modul ini. Pesan error untuk UI;
 * RLS di database tetap menjadi penjaga utama.
 */
export async function requireEditor(module: AdminModule): Promise<{ userId: string; name: string } | { error: string }> {
  const session = await getAdminSession();
  if (session.mode === "demo") return { error: "Mode demo: sambungkan Supabase untuk menyimpan." };
  // Login member & admin memakai sesi browser yang sama → login sebagai member di tab lain mengeluarkan akun admin.
  if (session.mode === "denied") {
    return {
      error: session.email
        ? `Sesi admin berakhir — browser ini sekarang login sebagai ${session.email} (bukan akun tim). Masuk lagi lewat /masuk/admin.`
        : "Sesi admin berakhir — masuk lagi lewat /masuk/admin.",
    };
  }
  if (!canAccess(session, module, "edit")) return { error: `Role kamu tidak punya izin mengubah ${MODULE_LABEL[module]}.` };
  return { userId: session.userId, name: session.name };
}

/** Catat ke Log aktivitas admin (Settings). Gagal mencatat tidak membatalkan aksi. */
export async function audit(actorId: string, action: string, entityType: string, entityId?: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("admin_audit_log").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId ?? null });
}

export type RefreshPath = string | [string, "page" | "layout"];

/**
 * Halaman website statis (ISR) yang menampilkan jadwal sesi — wajib di-revalidate setiap kali sesi
 * berubah, termasuk lewat trip (status activity ikut status trip).
 */
export const PUBLIC_SESSION_PATHS: RefreshPath[] = ["/", "/activity", ["/activity/[type]", "page"], ["/venue/[slug]", "page"]];

/** Satu-satunya halaman website yang menampilkan sisa slot ("x slots left", Upcoming Activities di detail venue). */
export const SLOTS_PATH: RefreshPath = ["/venue/[slug]", "page"];

/** Daftar peserta / booking sesi berubah → admin sesi + sisa slot di website. */
export function refreshRoster(sessionId: string, ...extra: RefreshPath[]) {
  refreshPaths(SLOTS_PATH, `/admin/activities/${sessionId}`, ...extra);
}

/** Segarkan admin (sidebar, daftar) + halaman website yang terdampak. */
export function refreshPaths(...paths: RefreshPath[]) {
  invalidateDataset();
  revalidatePath("/admin", "layout");
  for (const p of paths) {
    if (Array.isArray(p)) revalidatePath(p[0], p[1]);
    else revalidatePath(p);
  }
}

export const fail = (error: string): ActionResult => ({ ok: false, error });
export const done = (message: string): ActionResult => ({ ok: true, message });

// ── Host & fotografer member (session_hosts) ────────────────────────────────
export type CrewMemberInput = { memberId: string; role: "host" | "photographer" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id member harus UUID (ikut masuk filter PostgREST) dan perannya dikenal. */
export const invalidCrew = (crew: CrewMemberInput[]) => crew.some((c) => !UUID_RE.test(c.memberId) || (c.role !== "host" && c.role !== "photographer"));

/**
 * Samakan session_hosts di `sessionIds` dengan `crew`. Upsert dulu, baru hapus yang tidak ada di daftar —
 * gagal di tengah tidak pernah meninggalkan sesi tanpa host lamanya. Mengembalikan pesan error, atau null.
 */
export async function syncSessionHosts(sessionIds: string[], crew: CrewMemberInput[], assignedBy: string): Promise<string | null> {
  if (!sessionIds.length) return null;
  const supabase = await createSupabaseServerClient();
  const unique = [...new Map(crew.map((c) => [c.memberId, c])).values()];
  if (unique.length) {
    const rows = sessionIds.flatMap((sessionId) => unique.map((c) => ({ session_id: sessionId, member_id: c.memberId, role: c.role, assigned_by: assignedBy })));
    const { error } = await supabase.from("session_hosts").upsert(rows, { onConflict: "session_id,member_id" });
    if (error) return error.message;
  }
  let removal = supabase.from("session_hosts").delete().in("session_id", sessionIds);
  if (unique.length) removal = removal.not("member_id", "in", `(${unique.map((c) => c.memberId).join(",")})`);
  const { error } = await removal;
  return error?.message ?? null;
}
