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

export type GateSave = { score: number; lives: number; level: number; savedAt: number };

export type LeaderboardRow = { rank: number; name: string; photo: string | null; best: number; isMe: boolean };

export type StartSessionResult = { ok: true; sessionId: string } | { ok: false; error: string };

export type SubmitScoreResult =
  | { ok: true; pointsAwarded: number; best: number; carry: number; todayAwarded: number; dailyCap: number; demo?: boolean }
  | { ok: false; error: string };
