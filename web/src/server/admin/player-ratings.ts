import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Satu penilaian host untuk member (admin Members — penilaian level beta). ntrp null = "Tidak tahu". */
export type MemberRating = { hostId: string; hostName: string; ntrp: number | null; ratedAt: string };

type Row = { host_id: string; ntrp: number | string | null; rated_at: string; host: { full_name: string } | null };

/** Semua penilaian level untuk member ini, terbaru di atas (RLS: staf dengan izin Members). null = gagal dimuat. */
export async function getMemberRatings(memberId: string): Promise<MemberRating[] | null> {
  if (!isSupabaseConfigured) {
    const day = 86_400_000;
    return [
      { hostId: "demo-h1", hostName: "Dimas Prakoso", ntrp: 3.5, ratedAt: new Date(Date.now() - 3 * day).toISOString() },
      { hostId: "demo-h2", hostName: "Sari Anggraini", ntrp: 4.0, ratedAt: new Date(Date.now() - 12 * day).toISOString() },
      { hostId: "demo-h3", hostName: "Andi Saputra", ntrp: null, ratedAt: new Date(Date.now() - 20 * day).toISOString() },
    ];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("player_ratings")
    .select("host_id, ntrp, rated_at, host:profiles!player_ratings_host_id_fkey(full_name)")
    .eq("member_id", memberId)
    .order("rated_at", { ascending: false })
    .returns<Row[]>();
  // 42P01 / PGRST205 = migrasi belum dipasang → kartu tampil kosong.
  if (error) return error.code === "42P01" || error.code === "PGRST205" ? [] : null;
  return (data ?? []).map((r) => ({ hostId: r.host_id, hostName: r.host?.full_name ?? "Host", ntrp: r.ntrp === null ? null : Number(r.ntrp), ratedAt: r.rated_at }));
}
