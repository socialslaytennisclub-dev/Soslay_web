/**
 * Aturan Slay Rally (/game) yang dipakai klien & server. Hadiah bulanan juga ada di RPC
 * game_settle_months (migrasi 20261121000000) — ubah keduanya bersamaan.
 */

/** Slay Point untuk juara 1, 2, 3 leaderboard bulanan (bulan kalender WIB, dibayar saat bulan berakhir). */
export const GAME_MONTHLY_PRIZES = [20, 10, 5] as const;
/** Hadiah untuk peringkat tertentu (0 bila di luar 3 besar). */
export const monthlyPrize = (rank: number | null | undefined) => (rank ? (GAME_MONTHLY_PRIZES[rank - 1] ?? 0) : 0);
/** Nama bulan berjalan (WIB), mis. "November". */
export const currentMonthName = () => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "Asia/Jakarta" }).format(new Date());
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
  /** `best` & `rank` = skor terbaik dan peringkat member di leaderboard bulan ini. */
  | { ok: true; best: number; rank: number | null; demo?: boolean }
  | { ok: false; error: string };
