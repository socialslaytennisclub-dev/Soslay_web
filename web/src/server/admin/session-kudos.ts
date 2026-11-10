import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_KUDOS_CATEGORIES } from "@/lib/kudos";
import { membersByIds } from "./identity";
import type { SessionKudosEntry } from "./types";

type KudosRow = {
  id: string;
  giver_member_id: string | null;
  receiver_member_id: string;
  receiver_role: "participant" | "host";
  category_key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_reason: string | null;
  deleted_source: "giver" | "admin" | "system" | null;
};

/**
 * Kudos sebuah activity untuk admin (BR-23 · K-8 / K-10): RLS "admin read kudos" — pemberi ikut terlihat
 * (moderasi). Termasuk yang sudah dihapus (ditandai). `load` = false → tanpa query (demo / belum selesai).
 */
export async function loadSessionKudosAdmin(sessionId: string, load: boolean): Promise<SessionKudosEntry[]> {
  if (!load) return [];
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: cats }] = await Promise.all([
    supabase
      .from("kudos")
      .select("id, giver_member_id, receiver_member_id, receiver_role, category_key, created_at, updated_at, deleted_at, deleted_reason, deleted_source")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .returns<KudosRow[]>(),
    supabase.from("kudos_categories").select("key, label").returns<{ key: string; label: string }[]>(),
  ]);
  const rows = data ?? [];
  const labels = new Map((cats?.length ? cats : DEFAULT_KUDOS_CATEGORIES).map((c) => [c.key, c.label]));
  const people = await membersByIds([...new Set(rows.flatMap((r) => [r.giver_member_id, r.receiver_member_id]).filter((id): id is string => Boolean(id)))]);
  return rows.map((r) => ({
    id: r.id,
    giver: r.giver_member_id ? { id: r.giver_member_id, name: people.get(r.giver_member_id)?.fullName ?? "Member" } : null,
    receiver: { id: r.receiver_member_id, name: people.get(r.receiver_member_id)?.fullName ?? "Member" },
    receiverRole: r.receiver_role,
    category: labels.get(r.category_key) ?? r.category_key,
    at: r.updated_at,
    deleted: r.deleted_at ? { at: r.deleted_at, reason: r.deleted_reason, source: r.deleted_source ?? "admin" } : null,
  }));
}

export type AdminKudosCategory = { key: string; label: string; group: "skill" | "attitude"; active: boolean };

/** Semua kategori kudos (termasuk nonaktif) untuk Slay Point → Aturan poin. Demo / tabel belum ada → isi awal. */
export async function listKudosCategoriesAdmin(): Promise<AdminKudosCategory[]> {
  if (!isSupabaseConfigured) return DEFAULT_KUDOS_CATEGORIES.map((c) => ({ ...c, active: true }));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("kudos_categories").select("key, label, group, is_active").order("sort_order").returns<{ key: string; label: string; group: "skill" | "attitude"; is_active: boolean }[]>();
  if (error || !data) return DEFAULT_KUDOS_CATEGORIES.map((c) => ({ ...c, active: true }));
  return data.map((c) => ({ key: c.key, label: c.label, group: c.group, active: c.is_active }));
}
