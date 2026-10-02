import { formatBulanPendek } from "./format";

/** Nama hari, urut kolom heatmap (Senin → Minggu). */
export const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

export type HeatmapDay = {
  date: string; // YYYY-MM-DD
  count: number;
  /** 0 = kosong · 1–3 = makin gelap (indigo-200 → indigo-500 → navy). */
  level: 0 | 1 | 2 | 3;
  isNext: boolean;
};

export type HeatmapData = {
  weeks: HeatmapDay[][];
  /** Label bulan + jumlah kolom minggu yang dicakup (mulai minggu = bulan hari Senin-nya). */
  months: { label: string; span: number }[];
  total: number;
  favoriteDay: (typeof WEEKDAYS)[number] | null;
};

const DAY_MS = 86_400_000;

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ambil `weekCount` minggu terakhir dari data hitungan sesi per hari.
 * Level dihitung relatif ke hari tersibuk di seluruh data, supaya warna konsisten antar periode.
 */
export function buildHeatmap(
  counts: number[][],
  lastWeekStart: string,
  weekCount: number,
  nextSession?: string,
): HeatmapData {
  const max = Math.max(1, ...counts.flat());
  const lastMonday = new Date(`${lastWeekStart}T00:00:00Z`).getTime();
  const slice = counts.slice(-weekCount);
  const dayTotals = new Array<number>(7).fill(0);
  const months: HeatmapData["months"] = [];
  let total = 0;

  const weeks = slice.map((days, index) => {
    const monday = new Date(lastMonday - (slice.length - 1 - index) * 7 * DAY_MS);
    const label = formatBulanPendek(monday);
    const current = months.at(-1);
    if (current?.label === label) current.span += 1;
    else months.push({ label, span: 1 });

    return days.map((count, day): HeatmapDay => {
      const date = toISO(new Date(monday.getTime() + day * DAY_MS));
      total += count;
      dayTotals[day] += count;
      return {
        date,
        count,
        level: count === 0 ? 0 : (Math.min(3, Math.ceil((count / max) * 3)) as 1 | 2 | 3),
        isNext: date === nextSession,
      };
    });
  });

  const best = Math.max(...dayTotals);
  return { weeks, months, total, favoriteDay: best > 0 ? WEEKDAYS[dayTotals.indexOf(best)] : null };
}
