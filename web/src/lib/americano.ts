/**
 * Line-up Americano doubles: tiap ronde, 4 pemain per court (2 vs 2), sisanya rest.
 * Target: jumlah main serata mungkin, partner tidak berulang, lawan bervariasi, dan
 * tidak ada yang rest dua ronde berturut-turut kalau bisa dihindari.
 *
 * Rotating Partner = aturan yang sama + tim di tiap court diseimbangkan per level (opsi `levels`).
 *
 * Generator acak + skor penalti: beberapa percobaan, ambil jadwal dengan penalti terkecil.
 * Murni (tanpa I/O) — dipakai di admin (client) dan server.
 */

/** Format yang memakai line-up per ronde & court (lihat MatchFormat). */
export const usesLineup = (format: string) => format === "americano" || format === "rotating";

export type LineupMatch = { round: number; court: number; a: [string, string]; b: [string, string] };

export type LineupConfig = { players: string[]; courts: number; rounds: number };

/** Bobot level per pemain (1 = beginner … 5 = advanced) — diisi untuk Rotating Partner. */
export type LevelWeights = Record<string, number>;

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

function shuffle<T>(list: T[], rand: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Court yang benar-benar bisa diisi: maksimal floor(pemain / 4). */
export const playableCourts = (players: number, courts: number) => Math.max(0, Math.min(courts, Math.floor(players / 4)));

type History = { games: Map<string, number>; partners: Map<string, number>; opponents: Map<string, number>; lastRest: Set<string> };

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

function emptyHistory(players: string[]): History {
  return { games: new Map(players.map((p) => [p, 0])), partners: new Map(), opponents: new Map(), lastRest: new Set() };
}

function record(h: History, matches: LineupMatch[], players: string[]) {
  const playing = new Set<string>();
  for (const m of matches) {
    for (const p of [...m.a, ...m.b]) {
      playing.add(p);
      bump(h.games, p);
    }
    bump(h.partners, pairKey(...m.a));
    bump(h.partners, pairKey(...m.b));
    for (const x of m.a) for (const y of m.b) bump(h.opponents, pairKey(x, y));
  }
  h.lastRest = new Set(players.filter((p) => !playing.has(p)));
}

/** Penalti satu court: partner berulang mahal, lawan berulang murah, selisih level tim (Rotating). */
function courtCost(h: History, a: [string, string], b: [string, string], levels?: LevelWeights) {
  let cost = 10 * ((h.partners.get(pairKey(...a)) ?? 0) + (h.partners.get(pairKey(...b)) ?? 0));
  for (const x of a) for (const y of b) cost += h.opponents.get(pairKey(x, y)) ?? 0;
  if (levels) {
    const strength = (t: [string, string]) => (levels[t[0]] ?? 3) + (levels[t[1]] ?? 3);
    cost += 4 * Math.abs(strength(a) - strength(b));
  }
  return cost;
}

function planRound(h: History, players: string[], courts: number, round: number, rand: () => number, levels?: LevelWeights): LineupMatch[] {
  // Pilih yang paling sedikit main; seri → yang rest ronde lalu didahulukan, lalu acak.
  const order = shuffle(players, rand).sort((x, y) => {
    const g = (h.games.get(x) ?? 0) - (h.games.get(y) ?? 0);
    if (g !== 0) return g;
    return Number(h.lastRest.has(y)) - Number(h.lastRest.has(x));
  });
  const picked = order.slice(0, courts * 4);

  let best: LineupMatch[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = shuffle(picked, rand);
    const matches: LineupMatch[] = [];
    let cost = 0;
    for (let c = 0; c < courts; c++) {
      const [p1, p2, p3, p4] = s.slice(c * 4, c * 4 + 4);
      // 3 cara membagi 4 pemain jadi 2 tim — ambil yang termurah.
      const options: [[string, string], [string, string]][] = [
        [[p1, p2], [p3, p4]],
        [[p1, p3], [p2, p4]],
        [[p1, p4], [p2, p3]],
      ];
      let pick = options[0];
      let pickCost = Infinity;
      for (const o of options) {
        const oc = courtCost(h, o[0], o[1], levels);
        if (oc < pickCost) [pick, pickCost] = [o, oc];
      }
      matches.push({ round, court: c + 1, a: pick[0], b: pick[1] });
      cost += pickCost;
    }
    if (cost < bestCost) [best, bestCost] = [matches, cost];
    if (bestCost === 0) break;
  }
  return best;
}

/** Penalti total jadwal — makin kecil makin seimbang. */
export function lineupCost(matches: LineupMatch[], players: string[], levels?: LevelWeights): number {
  const h = emptyHistory(players);
  let cost = 0;
  let restStreak = 0;
  const rounds = [...new Set(matches.map((m) => m.round))].sort((x, y) => x - y);
  for (const r of rounds) {
    const round = matches.filter((m) => m.round === r);
    for (const m of round) cost += courtCost(h, m.a, m.b, levels);
    const prevRest = h.lastRest;
    record(h, round, players);
    for (const p of h.lastRest) if (prevRest.has(p)) restStreak++;
  }
  const games = [...h.games.values()];
  return cost + 25 * (Math.max(...games, 0) - Math.min(...games, 0)) + 3 * restStreak;
}

/**
 * Buat jadwal ronde `fromRound`..`rounds`. `history` = match ronde sebelumnya yang dipertahankan
 * (dipakai saat acak ulang setelah ada yang absen) supaya keseimbangan dihitung dari awal sesi.
 */
export function generateLineup(
  { players, courts, rounds }: LineupConfig,
  options: { fromRound?: number; history?: LineupMatch[]; attempts?: number; rand?: () => number; levels?: LevelWeights } = {},
): LineupMatch[] {
  const { fromRound = 1, history = [], attempts = 40, rand = Math.random, levels } = options;
  const playable = playableCourts(players.length, courts);
  if (!playable || fromRound > rounds) return [];

  let best: LineupMatch[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const h = emptyHistory(players);
    const keep = history.filter((m) => m.round < fromRound);
    for (const r of [...new Set(keep.map((m) => m.round))].sort((x, y) => x - y)) {
      record(h, keep.filter((m) => m.round === r), players);
    }
    const plan: LineupMatch[] = [];
    for (let r = fromRound; r <= rounds; r++) {
      const round = planRound(h, players, playable, r, rand, levels);
      record(h, round, players);
      plan.push(...round);
    }
    const cost = lineupCost([...keep, ...plan], players, levels);
    if (cost < bestCost) [best, bestCost] = [plan, cost];
  }
  return best;
}

/** Ringkasan untuk UI: main per pemain & partner yang berulang. */
export function lineupStats(matches: LineupMatch[], players: string[], levels?: LevelWeights) {
  const games = new Map(players.map((p) => [p, 0]));
  const partners = new Map<string, number>();
  for (const m of matches) {
    for (const p of [...m.a, ...m.b]) games.set(p, (games.get(p) ?? 0) + 1);
    bump(partners, pairKey(...m.a));
    bump(partners, pairKey(...m.b));
  }
  const counts = [...games.values()];
  // Selisih level tim terbesar di satu court (hanya bermakna untuk Rotating Partner).
  const strength = (t: [string, string]) => (levels?.[t[0]] ?? 3) + (levels?.[t[1]] ?? 3);
  const maxLevelGap = levels ? Math.max(0, ...matches.map((m) => Math.abs(strength(m.a) - strength(m.b)))) : 0;
  return {
    maxLevelGap,
    games,
    minGames: counts.length ? Math.min(...counts) : 0,
    maxGames: counts.length ? Math.max(...counts) : 0,
    repeatedPartners: [...partners.values()].filter((n) => n > 1).length,
  };
}
