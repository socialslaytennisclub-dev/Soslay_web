/**
 * Aturan Slay Rally (/game) yang dipakai klien & server. Angka konversi dan batas harian
 * juga ada di RPC submit_game_score (migrasi 20261120000000) — ubah keduanya bersamaan.
 */

/** Setiap sekian poin game (akumulasi, sisa terbawa) = 1 Slay Point. */
export const GAME_POINTS_PER_SLAY_POINT = 100;
/** Maksimal Slay Point dari game per hari (WIB). */
export const GAME_DAILY_POINT_CAP = 10;
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
  | { ok: true; pointsAwarded: number; best: number; carry: number; todayAwarded: number; dailyCap: number; demo?: boolean }
  | { ok: false; error: string };
