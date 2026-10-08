import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminModule, ModuleAccess } from "./types";

export type AdminSession =
  | { mode: "demo"; name: string; role: string }
  | { mode: "live"; userId: string; name: string; role: string; access: Record<AdminModule, ModuleAccess> }
  | { mode: "denied"; email: string | null };

/**
 * Siapa yang membuka admin. Mode demo (tanpa Supabase) → user contoh. Mode live → user
 * login harus ada di staff_members dengan status aktif; izin per modul dari role_permissions.
 */
export const getAdminSession = cache(async (): Promise<AdminSession> => {
  if (!isSupabaseConfigured) return { mode: "demo", name: "Rara Anindya", role: "Super Admin" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mode: "denied", email: null };

  const { data } = await supabase.rpc("my_admin_access").maybeSingle();
  const row = data as { full_name: string; role_name: string; permissions: Record<AdminModule, ModuleAccess> } | null;
  if (!row) return { mode: "denied", email: user.email ?? null };

  return { mode: "live", userId: user.id, name: row.full_name, role: row.role_name, access: row.permissions };
});

export function canAccess(session: AdminSession, module: AdminModule, level: "view" | "edit" = "view") {
  if (session.mode === "demo") return true;
  if (session.mode === "denied") return false;
  const access = session.access[module] ?? "none";
  return level === "view" ? access !== "none" : access === "edit";
}
