"use server";

import { cookies } from "next/headers";
import { DEMO_MEMBER_COOKIE, DEMO_MEMBER_NAME } from "@/lib/demo-member";
import { GAME_DAILY_POINT_CAP, GAME_POINTS_PER_SLAY_POINT, type LeaderboardRow, type StartSessionResult, type SubmitScoreResult } from "@/lib/game";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "@/server/member/user";

/**
 * Slay Rally (/game): buka sesi game member (waktu mulai dicatat server), kirim skor sekali per
 * sesi (→ Slay Point lewat RPC submit_game_score), dan leaderboard publik setelah game over.
 * Aturan & validasi skor ada di migrasi 20261120000000.
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
  already_submitted: "This game's score is already saved.",
  session_expired: "This game ran too long to be saved. Start a new one!",
  invalid_session: "This game couldn't be saved. Reload the page and play again.",
};

const SAVE_FAILED = "Couldn't save your score. Please try again.";

/** Mulai game member: catat waktu mulai di server. Skor game ini hanya bisa dikirim dengan id sesi ini. */
export async function startGameSession(): Promise<StartSessionResult> {
  if (!isSupabaseConfigured) {
    if (!(await cookies()).has(DEMO_MEMBER_COOKIE)) return { ok: false, error: ERRORS.not_member };
    return { ok: true, sessionId: `demo-${Date.now()}` };
  }
  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: ERRORS.not_member };
  const { data, error } = await supabase.rpc("start_game_session");
  if (error || typeof data !== "string") return { ok: false, error: error?.message?.includes("not_member") ? ERRORS.not_member : SAVE_FAILED };
  return { ok: true, sessionId: data };
}

function clean(n: unknown, max: number) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0;
}

export async function submitGameScore(input: { sessionId: string; score: number; level: number }): Promise<SubmitScoreResult> {
  const score = clean(input.score, 100_000);
  const level = Math.max(clean(input.level, 1000), 1);
  const sessionId = String(input.sessionId ?? "");

  if (!isSupabaseConfigured) {
    // Mode demo: tidak disimpan — hanya untuk mengecek tampilan.
    if (!(await cookies()).has(DEMO_MEMBER_COOKIE)) return { ok: false, error: ERRORS.not_member };
    const pointsAwarded = Math.min(Math.floor(score / GAME_POINTS_PER_SLAY_POINT), GAME_DAILY_POINT_CAP);
    return { ok: true, demo: true, pointsAwarded, best: score, carry: score % GAME_POINTS_PER_SLAY_POINT, todayAwarded: pointsAwarded, dailyCap: GAME_DAILY_POINT_CAP };
  }

  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: ERRORS.not_member };
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: ERRORS.invalid_session };
  const { data, error } = await supabase.rpc("submit_game_score", { p_session: sessionId, p_score: score, p_level: level });
  if (error || !data) {
    const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
    return { ok: false, error: key ? ERRORS[key] : SAVE_FAILED };
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
