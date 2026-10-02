const rupiah = new Intl.NumberFormat("id-ID");

/** 220000 → "Rp. 220.000" (format harga di desain Soslay). */
export function formatRupiah(amount: number): string {
  return `Rp. ${rupiah.format(amount)}`;
}

/** "500+" → { value: 500, prefix: "", suffix: "+" } — untuk animasi statistik. */
export function parseStat(raw: string): { value: number; prefix: string; suffix: string } {
  const match = raw.match(/^(\D*)([\d.,]+)(.*)$/);
  if (!match) return { value: 0, prefix: "", suffix: raw };
  const [, prefix, digits, suffix] = match;
  return { value: Number(digits.replace(/[.,]/g, "")), prefix, suffix };
}

/** Zona waktu IANA per kota venue (Jakarta = WIB, Bali = WITA). */
export const CITY_TIMEZONE = {
  Jakarta: "Asia/Jakarta",
  Bali: "Asia/Makassar",
} as const;

export type City = keyof typeof CITY_TIMEZONE;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Date → "Minggu, 4 Oktober 2026" (di zona waktu venue). */
export function formatTanggal(date: Date, timeZone: string = CITY_TIMEZONE.Jakarta): string {
  return dateFormatter(timeZone).format(date);
}

/** "07:00", "11:00" → "07.00 - 11.00" (format jam Indonesia, seperti di desain). */
export function formatJamRange(start: string, end: string, separator = " - "): string {
  return `${start.replace(":", ".")}${separator}${end.replace(":", ".")}`;
}

/** "2026-09-20" + kota → "Minggu, 20 September 2026" (tanggal saja, di zona waktu kota). */
export function formatTanggalISO(date: string, city: City): string {
  const offset = city === "Bali" ? "+08:00" : "+07:00";
  return formatTanggal(new Date(`${date}T12:00:00${offset}`), CITY_TIMEZONE[city]);
}

const shortMonth = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" });

/** "2026-10-03" → { day: "03", month: "OKT" } — kotak tanggal di daftar aktivitas. */
export function formatTanggalBox(date: string): { day: string; month: string } {
  const [, , day] = date.split("-");
  return { day, month: shortMonth.format(new Date(`${date}T00:00:00Z`)).replace(".", "").toUpperCase() };
}

/** Date (UTC) → "Sep" — label bulan di heatmap. */
export function formatBulanPendek(date: Date): string {
  return shortMonth.format(date).replace(".", "");
}

const thousands = new Intl.NumberFormat("id-ID");

/** 2450 → "2.450". */
export function formatAngka(value: number): string {
  return thousands.format(value);
}
