const WEEK_MS = 7 * 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Data contoh bertanggal tetap (YYYY-MM-DD) lama-lama lewat semua. Geser per kelipatan minggu (hari &
 * jam tetap, jarak antar-sesi tetap) supaya tanggal terakhir selalu ≥ 1 minggu ke depan.
 * Hanya untuk mode demo — jangan dipakai untuk data asli.
 */
export function shiftDemoDates<T extends { date: string }>(items: T[], now = Date.now()): T[] {
  if (!items.length) return items;
  const last = Math.max(...items.map((item) => day(item.date)));
  const weeks = Math.max(0, Math.ceil((now + WEEK_MS - last) / WEEK_MS));
  if (!weeks) return items;
  return items.map((item) => ({ ...item, date: new Date(day(item.date) + weeks * WEEK_MS).toISOString().slice(0, 10) }));
}
