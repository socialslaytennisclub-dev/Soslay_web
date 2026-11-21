"use server";

import { cookies } from "next/headers";
import { DEMO_MEMBER_COOKIE, DEMO_MEMBER_NAME } from "@/lib/demo-member";
import { LEADERBOARD_SIZE, rankPrize, NOT_MEMBER, type LeaderboardRow, type StartSessionResult, type SubmitScoreResult } from "@/lib/game";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMemberSession } from "@/server/member/user";

/**
 * Slay Rally (/game): buka sesi game member (waktu mulai dicatat server), kirim skor sekali per
 * sesi, dan leaderboard publik (permanen) setelah game over. Menyalip ke 3 besar memberi Slay Point
 * (GAME_RANK_PRIZES). Validasi skor di migrasi 20261120000000, hadiah peringkat di 20261121000000.
 */

const DEMO_BOARD: LeaderboardRow[] = [
  { rank: 1, name: "Felisya", best: 1240, isMe: false },
  { rank: 2, name: "Raka", best: 985, isMe: false },
  { rank: 3, name: "Nadine", best: 760, isMe: false },
  { rank: 4, name: "Bima", best: 512, isMe: false },
  { rank: 5, name: "Cintya", best: 430, isMe: false },
];

const ERRORS: Record<string, string> = {
  not_member: NOT_MEMBER,
  implausible_score: "We couldn't verify this score, so it wasn't saved.",
  already_submitted: "This game's score is already saved.",
  session_expired: "This game ran too long to be saved. Start a new one!",
  too_many_sessions: "Too many games started in a short time, so this score wasn't saved. Try again in a few minutes.",
  invalid_session: "This game couldn't be saved. Reload the page and play again.",
};

const SAVE_FAILED = "Couldn't save your score. Please try again.";

/** RPC game me-raise kunci error polos ("not_member", …) → pesan untuk pemain. */
function rpcFailure(error: { message?: string } | null) {
  const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
  return { ok: false as const, error: key ? ERRORS[key] : SAVE_FAILED };
}

/** Mode demo (tanpa Supabase): "login" = cookie dari Masuk / Daftar demo. */
async function isDemoMember() {
  return (await cookies()).has(DEMO_MEMBER_COOKIE);
}

/** Mulai game member: catat waktu mulai di server. Skor game ini hanya bisa dikirim dengan id sesi ini. */
export async function startGameSession(): Promise<StartSessionResult> {
  if (!isSupabaseConfigured) {
    if (!(await isDemoMember())) return { ok: false, error: NOT_MEMBER };
    return { ok: true, sessionId: `demo-${Date.now()}` };
  }
  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: NOT_MEMBER };
  const { data, error } = await supabase.rpc("start_game_session");
  if (error || typeof data !== "string") return rpcFailure(error);
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
    if (!(await isDemoMember())) return { ok: false, error: NOT_MEMBER };
    // Tampilan saja: peringkat dihitung dari papan contoh, hadiah seolah belum pernah diambil.
    const rank = DEMO_BOARD.filter((r) => r.best >= score).length + 1;
    const prize = rankPrize(rank);
    return { ok: true, demo: true, best: score, rank, prize, claimed: prize > 0 ? [rank] : [] };
  }

  const { supabase, user } = await getMemberSession();
  if (!user) return { ok: false, error: NOT_MEMBER };
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: ERRORS.invalid_session };
  const { data, error } = await supabase.rpc("submit_game_score", { p_session: sessionId, p_score: score, p_level: level });
  if (error || !data) return rpcFailure(error);
  const { best, rank, prize, claimed } = data as { best: number; rank: number | null; prize: number; claimed: number[] };
  return { ok: true, best, rank, prize, claimed };
}

/** Leaderboard permanen: skor terbaik teratas (nama tampilan / nama depan) + baris pemanggil bila di luar daftar itu. */
export async function getGameLeaderboard(myScore?: number): Promise<LeaderboardRow[]> {
  if (!isSupabaseConfigured) {
    if (!myScore || !(await isDemoMember())) return DEMO_BOARD;
    return [...DEMO_BOARD, { rank: 0, name: DEMO_MEMBER_NAME, best: myScore, isMe: true }]
      .sort((a, b) => b.best - a.best)
      .map((r, i) => ({ ...r, rank: i + 1 }))
      .filter((r) => r.rank <= LEADERBOARD_SIZE || r.isMe);
  }
  // Tanpa getMemberSession: RPC membaca auth.uid() dari cookie sendiri, jadi tidak perlu getUser().
  const supabase = await createSupabaseServerClient("member");
  const { data, error } = await supabase.rpc("game_leaderboard", { p_limit: LEADERBOARD_SIZE });
  // Gagal ≠ kosong: klien menampilkan "couldn't load", bukan "no scores yet".
  if (error) throw new Error("leaderboard_failed");
  return ((data ?? []) as { rank: number; name: string; best: number; is_me: boolean }[]).map((r) => ({
    rank: r.rank,
    name: r.name,
    best: r.best,
    isMe: r.is_me,
  }));
}
