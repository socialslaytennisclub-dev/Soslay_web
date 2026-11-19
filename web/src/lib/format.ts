import { timezoneForCity, websiteRegion } from "./venue-options";
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

/**
 * Zona waktu IANA per wilayah venue (Jakarta, Tangerang & Yogyakarta = WIB, Bali = WITA). WITA / WIT: venue di
 * kota tanpa filter website di zona itu (mis. Makassar, Jayapura) — supaya jam jadwalnya tetap jam lokal.
 */
export const CITY_TIMEZONE = {
  Jakarta: "Asia/Jakarta",
  Tangerang: "Asia/Jakarta",
  Yogyakarta: "Asia/Jakarta",
  Bali: "Asia/Makassar",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
} as const;

export type City = keyof typeof CITY_TIMEZONE;

const UTC_OFFSET = { "Asia/Jakarta": "+07:00", "Asia/Makassar": "+08:00", "Asia/Jayapura": "+09:00" } as const;

/** Offset UTC wilayah venue ("+07:00") — untuk menyusun waktu lokal "2026-11-20T07:00" jadi ISO. */
export const cityOffset = (city: City) => UTC_OFFSET[CITY_TIMEZONE[city]];

/**
 * Wilayah website dari kota venue di database (sama dengan filter Venue): Denpasar → "Bali", Tangerang &
 * Tangerang Selatan → "Tangerang", Yogyakarta → "Yogyakarta", Jabodetabek → "Jakarta". Kota tanpa filter →
 * zona waktunya (WITA / WIT), selain itu "Jakarta" (WIB).
 */
export const cityOf = (city: string): City => {
  const region = websiteRegion(city);
  if (region) return region;
  const tz = timezoneForCity(city);
  return tz === "Asia/Makassar" ? "WITA" : tz === "Asia/Jayapura" ? "WIT" : "Jakarta";
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
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

/** Date → "Sunday, 4 October 2026" (di zona waktu venue, format Figma Website v2). */
export function formatTanggal(date: Date, timeZone: string = CITY_TIMEZONE.Jakarta): string {
  const parts = Object.fromEntries(dateFormatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
}

/** "07:00", "11:00" → "07.00 - 11.00" (format jam Indonesia, seperti di desain). */
export function formatJamRange(start: string, end: string, separator = " - "): string {
  return `${start.replace(":", ".")}${separator}${end.replace(":", ".")}`;
}

/** "2026-09-20" + kota → "Sunday, 20 September 2026" (tanggal saja, di zona waktu kota). */
export function formatTanggalISO(date: string, city: City): string {
  return formatTanggal(new Date(`${date}T12:00:00${cityOffset(city)}`), CITY_TIMEZONE[city]);
}

/** Label zona waktu tiap kota venue. */
export const CITY_TZ_LABEL: Record<City, string> = { Jakarta: "WIB", Tangerang: "WIB", Yogyakarta: "WIB", Bali: "WITA", WITA: "WITA", WIT: "WIT" };

const shortFormatters = new Map<City, Intl.DateTimeFormat>();

/**
 * ISO → format pendek Indonesia di zona waktu kota venue:
 * "date" = "Sab, 31 Okt 2026" · "dateTime" = "31 Okt, 17.30" · "time" = "17.30".
 */
export function formatTanggalPendek(iso: string, city: City, part: "date" | "dateTime" | "time" = "date"): string {
  let formatter = shortFormatters.get(city);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      timeZone: CITY_TIMEZONE[city],
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    shortFormatters.set(city, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const time = `${p.hour}.${p.minute}`;
  if (part === "time") return time;
  return part === "dateTime" ? `${p.day} ${p.month}, ${time}` : `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

const shortMonth = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" });
const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "2026-10-03" → { day: "03", month: "OCT" } — kotak tanggal di daftar aktivitas. */
export function formatTanggalBox(date: string): { day: string; month: string } {
  const [, month, day] = date.split("-");
  return { day, month: MONTHS_EN[Number(month) - 1] };
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

/** Angka bertanda: 1250 → "+1.250", −3 → "−3", 0 → "0". */
export const formatSigned = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${formatAngka(Math.abs(n))}`;

/** Tanggal + jam WIB ("2026-10-17", "07:00") → Date. */
export const wibAt = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

/** ISO / Date → tanggal ("2026-10-17") & jam ("07:00") WIB. */
export function wibParts(at: string | Date): { date: string; time: string } {
  const iso = new Date(new Date(at).getTime() + 7 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
