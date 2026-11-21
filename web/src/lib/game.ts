/**
 * Aturan Slay Rally (/game) yang dipakai klien & server. Hadiah peringkat juga ada di RPC
 * submit_game_score (migrasi 20261121000000) — ubah keduanya bersamaan.
 */

/**
 * Slay Point saat menyalip ke peringkat 1, 2, 3 leaderboard (permanen, tanpa reset). Tiap peringkat
 * hanya sekali per member.
 */
export const GAME_RANK_PRIZES = [20, 10, 5] as const;
/** Hadiah untuk peringkat tertentu (0 bila di luar 3 besar). */
export const rankPrize = (rank: number | null | undefined) => (rank ? (GAME_RANK_PRIZES[rank - 1] ?? 0) : 0);
/** Hadiah terbesar yang masih bisa didapat dengan menyalip ke peringkat di atas `rank` (0 bila tidak ada). */
export function nextRankPrize(rank: number | null, claimed: readonly number[]): number {
  // Hadiah turun per peringkat → yang terbesar = peringkat teratas yang belum diambil.
  return GAME_RANK_PRIZES.slice(0, rank ? rank - 1 : undefined).find((_, i) => !claimed.includes(i + 1)) ?? 0;
}
/** Ronde terakhir yang boleh dimainkan tanpa akun. */
export const FREE_ROUNDS = 1;
/** Simpanan game tamu yang berhenti di gerbang daftar (localStorage, berlaku 24 jam). */
export const GATE_SAVE_KEY = "soslay-rally-gate";
export const GATE_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

/** Keadaan game yang dibawa melewati gerbang daftar (lihat engine.ts onGate / restore). */
export type GateState = { score: number; lives: number; level: number };
export type GateSave = GateState & { savedAt: number };

/** Pesan saat skor tidak bisa disimpan (dipakai klien & server action). */
export const NOT_MEMBER = "Sign in as a member to save your score.";
export const CONNECTION_LOST = "Connection lost — your score wasn't saved. Check your internet and reload the page.";

export const slayPointsLabel = (n: number) => `${n} Slay Point${n === 1 ? "" : "s"}`;

/** Baris leaderboard yang ditampilkan setelah game over (top N + baris sendiri). */
export const LEADERBOARD_SIZE = 5;

export type LeaderboardRow = { rank: number; name: string; best: number; isMe: boolean };

export type StartSessionResult = { ok: true; sessionId: string } | { ok: false; error: string };

export type SubmitScoreResult =
  /**
   * Skor terbaik & peringkat member setelah game ini; `prize` = Slay Point dari menyalip (0 bila tidak);
   * `claimed` = peringkat yang hadiahnya sudah pernah diterima (hadiah tiap peringkat hanya sekali).
   */
  | { ok: true; best: number; rank: number | null; prize: number; claimed: number[]; demo?: boolean }
  | { ok: false; error: string };
