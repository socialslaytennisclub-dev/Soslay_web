/** Validasi form Masuk/Daftar (client). Kunci = nama field, nilai = pesan error. */

import { checkEmailTypo } from "@/lib/email-typo";
import { phoneFormatError } from "@/lib/wa-invite";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Format longgar — login & data lama (email yang sudah tersimpan tidak ikut ditolak aturan baru). */
export const isEmail = (value: string) => EMAIL.test(value.trim());
/**
 * Format ketat untuk email BARU: bagian lokal & domain tanpa titik di awal/akhir atau titik ganda
 * ("gmail..com" ditolak Supabase → dulu lolos ke server dan berakhir "Couldn't create your account").
 */
const STRICT_EMAIL = /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+$/;
export const MIN_PASSWORD = 8;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Pesan email — member (Inggris) & admin (Indonesia); validateEmail memakai pesan Inggris yang sama. */
const EMAIL_MESSAGES = {
  en: { required: "Email is required", format: "Please enter a valid email", doubleDot: "Your email has two dots in a row", trailingDot: "Remove the dot at the end of your email", tld: (t: string) => `".${t}" isn't a valid email domain` },
  id: { required: "Isi email.", format: "Email tidak valid.", doubleDot: "Email berisi dua titik berurutan.", trailingDot: "Hapus titik di akhir email.", tld: (t: string) => `".${t}" bukan domain email yang valid.` },
};

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return EMAIL_MESSAGES.en.required;
  if (!isEmail(value)) return EMAIL_MESSAGES.en.format;
}

type NewEmailIssue = "required" | "format" | "doubleDot" | "trailingDot" | { tld: string };

/**
 * Masalah pada email BARU (daftar / ganti email), dalam urutan yang paling membantu: titik ganda & titik di
 * akhir punya pesan sendiri sebelum format umum; domain yang pasti salah (".con") ditolak. Saran "Did you
 * mean …?" tampil terpisah di bawah field (EmailSuggestion) → pesan tidak mengulangnya.
 */
function newEmailIssue(value: string): NewEmailIssue | undefined {
  const email = value.trim();
  if (!email) return "required";
  if (!isEmail(email)) return "format";
  if (email.includes("..")) return "doubleDot";
  const { invalidTld, trailingDot } = checkEmailTypo(email);
  if (trailingDot) return "trailingDot";
  if (!STRICT_EMAIL.test(email)) return "format";
  if (invalidTld) return { tld: invalidTld };
}

function newEmailError(value: string, lang: keyof typeof EMAIL_MESSAGES) {
  const issue = newEmailIssue(value);
  if (!issue) return undefined;
  const messages = EMAIL_MESSAGES[lang];
  return typeof issue === "string" ? messages[issue] : messages.tld(issue.tld);
}

/** Email BARU untuk member (Inggris). */
export const validateNewEmail = (value: string) => newEmailError(value, "en");

/** Versi admin (Indonesia) — form "Tambah member" & "Ganti email login". */
export const adminEmailError = (value: string) => newEmailError(value, "id");

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
