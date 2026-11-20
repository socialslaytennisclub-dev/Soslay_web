"use server";

import { cookies } from "next/headers";
import { DEMO_MEMBER_COOKIE, DEMO_MEMBER_NAME } from "@/lib/demo-member";
import { GAME_DAILY_POINT_CAP, GAME_POINTS_PER_SLAY_POINT, type LeaderboardRow, type SubmitScoreResult } from "@/lib/game";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "@/server/member/user";

/**
 * Slay Rally (/game): kirim skor game member (→ Slay Point lewat RPC submit_game_score) dan
 * leaderboard publik setelah game over. Aturan & validasi skor ada di migrasi 20261120000000.
 */

const DEMO_BOARD: LeaderboardRow[] = [
  { rank: 1, name: "Felisya", photo: null, best: 1240, isMe: false },
  { rank: 2, name: "Raka", photo: null, best: 985, isMe: false },
  { rank: 3, name: "Nadine", photo: null, best: 760, isMe: false },
  { rank: 4, name: "Bima", photo: null, best: 512, isMe: false },
  { rank: 5, name: "Cintya", photo: null, best: 430, isMe: false },
];

const ERRORS: Record<string, string> = {
  not_member: "Sign in as a member to save your score.",
  implausible_score: "We couldn't verify this score, so it wasn't saved.",
  too_fast: "Score already saved a moment ago.",
};

function clean(n: unknown, max: number) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0;
}

export async function submitGameScore(input: { score: number; level: number; durationMs: number }): Promise<SubmitScoreResult> {
  const score = clean(input.score, 100_000);
  const level = Math.max(clean(input.level, 1000), 1);
  const durationMs = clean(input.durationMs, 24 * 60 * 60 * 1000);

  if (!isSupabaseConfigured) {
    // Mode demo: tidak disimpan — hanya untuk mengecek tampilan.
    if (!(await cookies()).has(DEMO_MEMBER_COOKIE)) return { ok: false, error: ERRORS.not_member };
    const pointsAwarded = Math.min(Math.floor(score / GAME_POINTS_PER_SLAY_POINT), GAME_DAILY_POINT_CAP);
    return { ok: true, demo: true, pointsAwarded, best: score, carry: score % GAME_POINTS_PER_SLAY_POINT, todayAwarded: pointsAwarded, dailyCap: GAME_DAILY_POINT_CAP };
  }

  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: ERRORS.not_member };
  const { data, error } = await supabase.rpc("submit_game_score", { p_score: score, p_level: level, p_duration_ms: durationMs });
  if (error || !data) {
    const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
    return { ok: false, error: key ? ERRORS[key] : "Couldn't save your score. Please try again." };
  }
  const r = data as { points_awarded: number; best: number; carry: number; today_awarded: number; daily_cap: number };
  return { ok: true, pointsAwarded: r.points_awarded, best: r.best, carry: r.carry, todayAwarded: r.today_awarded, dailyCap: r.daily_cap };
}

/** Top 10 skor terbaik (nama tampilan / nama depan + foto) + baris pemanggil bila di luar top 10. */
export async function getGameLeaderboard(myScore?: number): Promise<LeaderboardRow[]> {
  if (!isSupabaseConfigured) {
    if (!myScore || !(await cookies()).has(DEMO_MEMBER_COOKIE)) return DEMO_BOARD;
    const rows = [...DEMO_BOARD.map((r) => ({ ...r })), { rank: 0, name: DEMO_MEMBER_NAME, photo: null, best: myScore, isMe: true }]
      .sort((a, b) => b.best - a.best)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return rows;
  }
  const { supabase } = await getMemberSession();
  const { data } = await supabase.rpc("game_leaderboard", { p_limit: 10 });
  return ((data ?? []) as { rank: number; name: string; photo: string | null; best: number; is_me: boolean }[]).map((r) => ({
    rank: r.rank,
    name: r.name,
    photo: r.photo,
    best: r.best,
    isMe: r.is_me,
  }));
}
