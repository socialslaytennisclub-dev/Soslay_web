import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { DEFAULT_KUDOS_CATEGORIES, toMemberKudos, type KudosCategory, type KudosGroup, type KudosTop, type MemberKudos, type SessionKudos } from "@/lib/kudos";
import { DEMO_MEMBER_KUDOS } from "../kudos-demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "./user";

/**
 * Kudos (BR-23) untuk member: semua lewat RPC security definer — tabel `kudos` tidak bisa dibaca member,
 * jadi nama pemberi tidak pernah sampai ke browser. Tanpa Supabase → data contoh.
 */

type SessionKudosRow = {
  window_closes_at: string;
  can_edit: boolean;
  receivers: { member_id: string; name: string; avatar: string | null; role: "participant" | "host"; category_key: string | null }[];
};

/** Kategori aktif (urut grup Skill → Sikap, lalu sort_order). */
export async function activeKudosCategories(supabase: SupabaseClient): Promise<KudosCategory[]> {
  const { data } = await supabase.from("kudos_categories").select("key, label, group, sort_order").eq("is_active", true).order("sort_order").returns<{ key: string; label: string; group: KudosGroup }[]>();
  return data?.length ? data.map((c) => ({ key: c.key, label: c.label, group: c.group })) : DEFAULT_KUDOS_CATEGORIES;
}

/** Bagian kudos sesi selesai; null = bukan pemberi eligible (RPC yang menentukan). */
export async function loadSessionKudos(supabase: SupabaseClient, sessionId: string): Promise<SessionKudos | null> {
  const [{ data, error }, categories] = await Promise.all([supabase.rpc("session_kudos", { p_session: sessionId }), activeKudosCategories(supabase)]);
  // PGRST202 = migrasi kudos belum dipasang → bagian kudos disembunyikan.
  if (error || !data) return null;
  const row = data as SessionKudosRow;
  return {
    windowClosesAt: row.window_closes_at,
    canEdit: row.can_edit,
    receivers: row.receivers.map((r) => ({ memberId: r.member_id, name: r.name, avatar: r.avatar, role: r.role, category: r.category_key })),
    categories,
  };
}

/** Chip kudos teratas per member_id (host & admin; RPC menolak diam-diam untuk yang lain → kosong). */
export async function loadKudosTop(supabase: SupabaseClient, sessionId: string): Promise<Map<string, KudosTop>> {
  const { data } = await supabase.rpc("session_kudos_top", { p_session: sessionId });
  return new Map(((data ?? []) as { member_id: string; label: string; count: number }[]).map((r) => [r.member_id, { label: r.label, count: r.count }]));
}

/** Kudos member yang login (kartu profil & halaman detail). */
export const getMyKudos = cache(async (): Promise<MemberKudos | null> => {
  if (!isSupabaseConfigured) return DEMO_MEMBER_KUDOS;
  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  const { data, error } = await supabase.rpc("member_kudos", { p_member: user.id });
  if (error) return null;
  return toMemberKudos(data);
});
