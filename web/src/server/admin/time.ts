/** Waktu admin: semua hitungan tanggal memakai WIB (UTC+7, tanpa DST). */
export const DAY = 86_400_000;
export const WIB = 7 * 3_600_000;

/** "2026-10" untuk tanggal dalam WIB. */
export const monthKey = (d: Date) => new Date(d.getTime() + WIB).toISOString().slice(0, 7);

/** Persen perubahan, 1 desimal; 0 bila pembanding kosong. */
export const pctDelta = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : 0);

/** Awal hari ini (00.00 WIB) — mis. filter member "daftar hari ini". */
export const startOfTodayWib = (now: Date) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now)}T00:00:00+07:00`);
