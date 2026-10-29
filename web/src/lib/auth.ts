/** Validasi form Masuk/Daftar (client). Kunci = nama field, nilai = pesan error. */

import { phoneFormatError } from "@/lib/wa-invite";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL.test(value.trim());
export const MIN_PASSWORD = 8;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email is required";
  if (!isEmail(value)) return "Please enter a valid email";
}

export function validatePassword(value: string, isNew = false): string | undefined {
  if (!value) return "Password is required";
  if (isNew && value.length < MIN_PASSWORD) return `Minimum ${MIN_PASSWORD} characters`;
}

/** Tanggal lokal hari ini "YYYY-MM-DD" (bukan UTC — di WIB toISOString masih "kemarin" sebelum jam 07.00). */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" yang benar-benar ada di kalender (2001-02-30 ditolak). */
export function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Tanggal lahir opsional: kosong boleh; isian harus tanggal valid & tidak di masa depan. */
export function validateBirthDate(value: string, latest = todayIso()): string | undefined {
  if (!value) return;
  if (!isValidIsoDate(value)) return "Enter a valid date (DD / MM / YYYY)";
  if (value > latest) return "Date of birth can't be in the future";
}

export type PasswordStrength = { level: 1 | 2 | 3 | 4; label: string; hint?: string };

/**
 * Perkiraan kekuatan password untuk bar indikator (bukan validasi): di bawah minimum → "Too short";
 * selebihnya +1 level untuk tiap kriteria — 12+ karakter, huruf besar & kecil, angka, simbol.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length < MIN_PASSWORD) return { level: 1, label: "Too short", hint: `${MIN_PASSWORD - value.length} more characters` };
  const checks = [
    { ok: value.length >= 12, hint: "make it 12+ characters" },
    { ok: /[a-z]/.test(value) && /[A-Z]/.test(value), hint: "mix upper & lowercase" },
    { ok: /\d/.test(value), hint: "add a number" },
    { ok: /[^A-Za-z0-9]/.test(value), hint: "add a symbol" },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const level = Math.min(4, 1 + passed) as PasswordStrength["level"];
  const label = (["Weak", "Fair", "Good", "Strong"] as const)[level - 1];
  return { level, label, hint: level < 4 ? checks.find((c) => !c.ok)?.hint : undefined };
}

/** Kuy ID = username Kuyy (mis. "andrekurn48-423"): huruf, angka, ".", "_", "-", 3–30 karakter; "@" di depan dibuang. */
const KUY_ID = /^[A-Za-z0-9._-]{3,30}$/;
export const normalizeKuyId = (value: string) => value.trim().replace(/^@/, "");
export const isKuyId = (value: string) => KUY_ID.test(normalizeKuyId(value));
export const KUY_ID_FORMAT_ERROR = "Kuy ID hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung (3–30 karakter, tanpa spasi).";

export function validateKuyId(value: string): string | undefined {
  if (!normalizeKuyId(value)) return "Kuy ID is required";
  if (!isKuyId(value)) return "Kuy ID: 3–30 letters, numbers, dots, underscores or hyphens — no spaces";
}

/** Sama dengan aturan form admin & profil (phoneFormatError) — nomor Indonesia 8xx. */
export function validatePhone(value: string): string | undefined {
  if (!value.replace(/\D/g, "")) return "WhatsApp number is required";
  if (phoneFormatError(value)) return "Enter a valid Indonesian WhatsApp number, e.g. 0812 3456 7890";
}

export function required(value: string, label: string): string | undefined {
  if (!value.trim()) return `${label} is required`;
}

/** Buang field tanpa error supaya `Object.keys(errors).length` = jumlah error. */
export function compact<K extends string>(errors: FieldErrors<K>): FieldErrors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as FieldErrors<K>;
}
