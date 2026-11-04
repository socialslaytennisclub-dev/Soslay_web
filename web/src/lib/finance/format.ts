/**
 * Format tampilan Keuangan (§10): Rupiah titik ribuan, minus unicode, singkatan jt / M, tanggal WIB.
 * Nilai positif memakai helper Rupiah admin (lib/admin-labels) supaya formatnya sama dengan modul lain;
 * di sini hanya ditambah tanda minus, "+", kurung laporan, dan singkatan miliar (M).
 */
import { formatRupiahPlain, formatRupiahShort } from "@/lib/admin-labels";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const MINUS = "−";

/** 4800000 → "4.800.000" (tanpa tanda). */
export const num = (v: number) => nf.format(Math.abs(Math.round(v)));

/** "Rp4.800.000" · negatif "−Rp4.800.000". */
export function rp(v: number): string {
  return `${v < 0 ? MINUS : ""}${formatRupiahPlain(Math.abs(Math.round(v)))}`;
}

/** Bertanda untuk daftar transaksi: "+Rp3.300.000" / "−Rp4.800.000". */
export function rpSigned(v: number): string {
  return `${v < 0 ? MINUS : "+"}${formatRupiahPlain(Math.abs(Math.round(v)))}`;
}

/** Laporan: pengeluaran dalam kurung "(4.800.000)". */
export function acct(v: number, negative = v < 0): string {
  return negative ? `(${num(v)})` : num(v);
}

/** KPI singkat: "Rp201,3 jt", "Rp1,42 M". */
export function rpShort(v: number): string {
  const sign = v < 0 ? MINUS : "";
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${sign}Rp${(a / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  return `${sign}${formatRupiahShort(Math.round(a))}`;
}

/** Sumbu grafik: "200 jt". */
export function jt(v: number): string {
  return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
}

/** 30.52 → "30,5%". null/NaN → "—". */
export function pct(v: number | null, digits = 1, signed = false): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = `${Math.abs(v).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  if (!signed) return v < 0 ? `${MINUS}${s}` : s;
  return `${v < 0 ? MINUS : "+"}${s}`;
}

export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const parts = (d: string) => d.slice(0, 10).split("-").map(Number) as [number, number, number];

/** "2026-10-31" → "31 Okt 2026" (tahun opsional). */
export function dateLabel(d: string, withYear = true): string {
  const [y, m, day] = parts(d);
  return `${day} ${MONTHS_SHORT[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "2026-10" → "Oktober 2026". */
export function monthLabel(ym: string, short = false): string {
  const [y, m] = ym.split("-").map(Number);
  return `${(short ? MONTHS_SHORT : MONTHS)[m - 1]} ${y}`;
}

/** ISO timestamp → "4 Nov 2026, 16.20 WIB". */
export function dateTimeWib(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d).replace(".", "");
  const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(d).replace(":", ".");
  return `${date}, ${time} WIB`;
}

/** Tanggal hari ini WIB sebagai YYYY-MM-DD. */
export function todayWib(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}
