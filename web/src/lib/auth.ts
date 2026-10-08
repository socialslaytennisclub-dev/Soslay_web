/** Validasi form Masuk/Daftar (client). Kunci = nama field, nilai = pesan error. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email wajib diisi";
  if (!EMAIL.test(value.trim())) return "Format email belum benar";
}

export function validatePassword(value: string, isNew = false): string | undefined {
  if (!value) return "Password wajib diisi";
  if (isNew && value.length < MIN_PASSWORD) return `Minimal ${MIN_PASSWORD} karakter`;
}

export function validatePhone(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Nomor WhatsApp wajib diisi";
  if (digits.length < 9) return "Nomor terlalu pendek";
}

export function required(value: string, label: string): string | undefined {
  if (!value.trim()) return `${label} wajib diisi`;
}

/** Buang field tanpa error supaya `Object.keys(errors).length` = jumlah error. */
export function compact<K extends string>(errors: FieldErrors<K>): FieldErrors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as FieldErrors<K>;
}
