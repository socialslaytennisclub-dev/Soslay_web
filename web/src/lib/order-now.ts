import { isEmail, MIN_PASSWORD } from "@/lib/auth";
import { phoneFormatError } from "@/lib/wa-invite";

/** Data akun di Order Now (/ordernow) — dicek sama di browser & server (server/shop/order-now). */
export type OrderNowAccount = { fullName: string; email: string; phone: string; password: string };
export type OrderNowAccountErrors = Partial<Record<keyof OrderNowAccount, string>>;

export function orderNowAccountErrors(a: OrderNowAccount): OrderNowAccountErrors {
  const e: OrderNowAccountErrors = {};
  if (!a.fullName.trim()) e.fullName = "Isi nama lengkap.";
  if (!isEmail(a.email)) e.email = "Email belum benar.";
  if (!a.phone.replace(/\D/g, "")) e.phone = "Isi nomor WhatsApp.";
  else if (phoneFormatError(a.phone)) e.phone = "Nomor WhatsApp Indonesia, mis. 0812 3456 7890.";
  if (a.password.length < MIN_PASSWORD) e.password = `Password minimal ${MIN_PASSWORD} karakter.`;
  return e;
}

/** Batas satu pesanan Order Now tanpa akun terverifikasi (stok tidak ditahan berlebihan). */
export const ORDER_NOW_MAX_UNITS = 5;

/** sessionStorage: email & kode pesanan untuk halaman /ordernow/verifikasi (data pribadi tidak lewat URL). */
export const ORDER_NOW_VERIFY_KEY = "soslay:ordernow-verify";
export type OrderNowVerify = { email: string; code: string; total: number; items: number };

/** Setelah verifikasi email Order Now → halaman Order di akun (pesanan yang menunggu bayar ada di sana). */
export const ORDER_NOW_AFTER_CONFIRM = "/akun/order";
/** Halaman bayar & status satu pesanan member. */
export const orderPayHref = (code: string) => `/akun/pesanan/${encodeURIComponent(code)}`;

/** Simpan / baca data halaman verifikasi (sessionStorage; mode privat → diabaikan, halaman tampil pesan umum). */
export function writeOrderNowVerify(data: OrderNowVerify) {
  try {
    sessionStorage.setItem(ORDER_NOW_VERIFY_KEY, JSON.stringify(data));
  } catch {
    // penyimpanan tidak tersedia
  }
}
export function readOrderNowVerifyRaw() {
  try {
    return sessionStorage.getItem(ORDER_NOW_VERIFY_KEY) ?? "";
  } catch {
    return "";
  }
}
