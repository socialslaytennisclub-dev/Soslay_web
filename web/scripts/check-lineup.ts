/**
 * Uji acak line-up (lib/americano): level pemain hanya penentu seri — aturan utama tetap menang.
 *
 *   npm run lineup:check
 *
 * Untuk beberapa roster level campur (seed tetap): dengan level, partner berulang & kelompok sama tidak lebih
 * banyak dari tanpa level, jumlah main tetap serata tanpa level, dan selisih level tim rata-rata turun.
 */
import { generateLineup, lineupStats, type LineupMatch } from "../src/lib/americano";
import { check, done } from "./_check";

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const LEVELS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const groupKey = (m: LineupMatch) => [...m.a, ...m.b].sort().join("|");

let gapWith = 0;
let gapWithout = 0;
for (const [n, courts, rounds] of [[8, 2, 7], [10, 2, 6], [12, 3, 6], [16, 4, 5], [9, 2, 6]] as const) {
  for (let seed = 1; seed <= 6; seed++) {
    const rand = seeded(seed * 97 + n);
    const players = Array.from({ length: n }, (_, i) => `p${i}`);
    const levels = Object.fromEntries(players.map((p) => [p, LEVELS[Math.floor(rand() * LEVELS.length)]]));
    const cfg = { players, courts, rounds };
    const without = generateLineup(cfg, { rand: seeded(seed) });
    const withLv = generateLineup(cfg, { rand: seeded(seed), levels });
    const a = lineupStats(without, players, levels);
    const b = lineupStats(withLv, players, levels);
    const repeatGroups = (m: LineupMatch[]) => m.length - new Set(m.map(groupKey)).size;
    const label = `${n} pemain · ${courts} court · ${rounds} ronde · seed ${seed}`;
    check(b.repeatedPartners <= a.repeatedPartners, `${label}: partner berulang ${a.repeatedPartners} → ${b.repeatedPartners} dengan level`);
    check(repeatGroups(withLv) <= repeatGroups(without), `${label}: kelompok sama bertambah dengan level`);
    check(b.maxGames - b.minGames <= a.maxGames - a.minGames, `${label}: jumlah main jadi tidak rata dengan level`);
    const gap = (m: LineupMatch[]) => m.reduce((s, x) => s + Math.abs(levels[x.a[0]] + levels[x.a[1]] - levels[x.b[0]] - levels[x.b[1]]), 0) / m.length;
    gapWith += gap(withLv);
    gapWithout += gap(without);
  }
}
check(gapWith < gapWithout * 0.85, `selisih level tim rata-rata tidak turun cukup: ${gapWithout.toFixed(1)} → ${gapWith.toFixed(1)}`);
done(`✓ acak line-up: level hanya penentu seri (partner/kelompok/jumlah main tidak memburuk), selisih level tim ${(gapWithout / 30).toFixed(2)} → ${(gapWith / 30).toFixed(2)}`);
