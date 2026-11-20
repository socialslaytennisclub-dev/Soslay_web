"use server";

import { cookies } from "next/headers";
import { DEMO_MEMBER_COOKIE } from "@/lib/demo-member";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { TENNIS_WIN_POINTS, type TennisMatchStart, type TennisReport } from "@/lib/tennis";
import { getMemberSession } from "@/server/member/user";

/**
 * Slay Tennis member vs member: catatan pertandingan di server supaya pemenang bisa diberi Slay
 * Point. Host membuka pertandingan, lawan bergabung, lalu KEDUANYA melaporkan hasil — poin hanya
 * keluar bila laporannya sama (aturan lengkap di migrasi 20261120010000). Lawan komputer tidak
 * memakai file ini dan tidak menghasilkan Slay Point.
 */

const NOT_MEMBER = "Sign in as a member to play for Slay Points.";
const FAILED = "Couldn't reach the server. This match won't count for Slay Points.";
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

async function demoMember() {
  return (await cookies()).has(DEMO_MEMBER_COOKIE);
}

/** Host: buka catatan pertandingan baru (juga untuk rematch). */
export async function openTennisMatch(): Promise<TennisMatchStart> {
  if (!isSupabaseConfigured) {
    return (await demoMember()) ? { ok: true, matchId: `demo-${Date.now()}` } : { ok: false, error: NOT_MEMBER };
  }
  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: NOT_MEMBER };
  const { data, error } = await supabase.rpc("tennis_match_open");
  if (error || typeof data !== "string") return { ok: false, error: error?.message?.includes("not_member") ? NOT_MEMBER : FAILED };
  return { ok: true, matchId: data };
}

/** Lawan: bergabung ke pertandingan yang dibuka host. */
export async function joinTennisMatch(matchId: string): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured) return { ok: await demoMember() };
  if (!isUuid(String(matchId))) return { ok: false };
  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false };
  const { error } = await supabase.rpc("tennis_match_join", { p_match: matchId });
  return { ok: !error };
}

/** Kedua pemain: laporkan siapa yang menang. Aman dipanggil ulang untuk membaca status terbaru. */
export async function reportTennisMatch(matchId: string, hostWon: boolean, iAmHost: boolean): Promise<TennisReport> {
  if (!isSupabaseConfigured) {
    // Mode demo: tidak disimpan — hanya untuk mengecek tampilan.
    if (!(await demoMember())) return { ok: false, error: NOT_MEMBER };
    const won = hostWon === iAmHost;
    return { ok: true, pending: false, won, points: won ? TENNIS_WIN_POINTS : 0, reason: null };
  }
  if (!isUuid(String(matchId))) return { ok: false, error: FAILED };
  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: NOT_MEMBER };
  const { data, error } = await supabase.rpc("tennis_match_report", { p_match: matchId, p_host_won: Boolean(hostWon) });
  if (error || !data) return { ok: false, error: FAILED };
  const r = data as { pending: boolean; won: boolean; points: number; reason: string | null };
  return {
    ok: true,
    pending: Boolean(r.pending),
    won: Boolean(r.won),
    points: Number(r.points) || 0,
    reason: (r.reason as "disputed" | "too_short" | "daily_cap" | "pair_cap" | null) ?? null,
  };
}
