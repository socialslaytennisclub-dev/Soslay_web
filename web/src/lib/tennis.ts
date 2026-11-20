/**
 * Aturan Slay Tennis (/gameoncourt) yang dipakai klien & server. Angka poin dan batas harian juga
 * ada di RPC tennis_match_report (migrasi 20261120010000) — ubah keduanya bersamaan.
 */

/** Slay Point untuk pemenang pertandingan member vs member. Lawan komputer: tanpa Slay Point. */
export const TENNIS_WIN_POINTS = 1;
/** Maksimal Slay Point dari Slay Tennis per pemenang per hari (WIB). */
export const TENNIS_DAILY_WIN_CAP = 5;
/** Game terakhir yang boleh dimainkan tanpa akun saat lawan komputer. */
export const TENNIS_FREE_GAMES = 1;
/** Simpanan pertandingan tamu yang berhenti di gerbang masuk (localStorage, berlaku 24 jam). */
export const TENNIS_GATE_KEY = "soslay-tennis-gate";
export const TENNIS_GATE_TTL_MS = 24 * 60 * 60 * 1000;

export type TennisGateSave = { games: [number, number]; server: 0 | 1; savedAt: number };

export type TennisMatchStart = { ok: true; matchId: string } | { ok: false; error: string };

export type TennisReport =
  | { ok: true; pending: boolean; won: boolean; points: number; reason: "disputed" | "too_short" | "daily_cap" | "pair_cap" | null }
  | { ok: false; error: string };
