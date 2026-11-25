/** Aturan validasi daftar — disalin dari web/src/lib/auth.ts & wa-invite.ts supaya hasilnya sama. */
export const MIN_PASSWORD = 8;
const KUY_ID = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeKuyId = (value: string) => value.trim().replace(/^@/, "");
export const localPhone = (raw: string) => raw.replace(/\D/g, "").replace(/^62/, "").replace(/^0/, "");

export type SignUpInput = { fullName: string; kuyId: string; phone: string; gender: "" | "male" | "female"; email: string; password: string };
export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

export function validateSignUp(v: SignUpInput): SignUpErrors {
  const e: SignUpErrors = {};
  if (!v.fullName.trim()) e.fullName = "Nama lengkap wajib diisi";
  if (!normalizeKuyId(v.kuyId)) e.kuyId = "Kuy ID wajib diisi";
  else if (!KUY_ID.test(normalizeKuyId(v.kuyId))) e.kuyId = "3–30 huruf, angka, titik, _ atau -, tanpa spasi";
  if (!v.phone.replace(/\D/g, "")) e.phone = "Nomor WhatsApp wajib diisi";
  else if (/[^\d\s()+.-]/.test(v.phone.trim()) || !/^8\d{8,11}$/.test(localPhone(v.phone))) e.phone = "Contoh: 0812 3456 7890";
  if (v.gender !== "male" && v.gender !== "female") e.gender = "Pilih gender";
  if (!EMAIL.test(v.email.trim())) e.email = "Cek lagi alamat email";
  if (v.password.length < MIN_PASSWORD) e.password = `Minimal ${MIN_PASSWORD} karakter`;
  return e;
}
