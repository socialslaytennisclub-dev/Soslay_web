/**
 * Line-up Americano doubles: tiap ronde, 4 pemain per court (2 vs 2), sisanya rest.
 * Target: jumlah main serata mungkin, partner tidak berulang, lawan bervariasi, kelompok 4 orang
 * yang sama tidak main bareng lagi, pemain yang baru bertemu (teman / lawan) tidak langsung bertemu
 * lagi di ronde berikutnya, dan tidak ada yang rest dua ronde berturut-turut kalau bisa dihindari.
 *
 * Rotating Partner = aturan yang sama + tim di tiap court diseimbangkan per level (opsi `levels`).
 *
 * Generator acak + skor penalti: beberapa percobaan, ambil jadwal dengan penalti terkecil.
 * Murni (tanpa I/O) — dipakai di admin (client) dan server.
 */

/** Format yang memakai line-up per ronde & court (lihat MatchFormat). */
export const usesLineup = (format: string) => format === "americano" || format === "rotating";

/**
 * Americano: match selesai saat total poin kedua tim = target poin. Rotating Partner tidak memakai target —
 * skor diisi bebas sesuai hasil di lapangan (mis. 6–4). Sama dengan SQL save_match_score.
 */
export const hasTargetTotal = (format: string) => format === "americano";

/** Batas target poin (dan skor satu tim) per match; target bawaan form sesi baru. */
export const SCORE_MAX = 99;
export const DEFAULT_TARGET_POINTS = 21;

/** Target poin per match, atau null bila format ini tanpa target (skor bebas). */
export const scoreTarget = (format: string, targetPoints: number): number | null => (hasTargetTotal(format) ? targetPoints : null);

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

type History = {
  games: Map<string, number>;
  partners: Map<string, number>;
  opponents: Map<string, number>;
  /** Kelompok 4 orang (satu court) yang sudah pernah main bareng → berapa kali. */
  groups: Map<string, number>;
  /** Pasangan pemain yang bertemu (teman atau lawan) di ronde terakhir. */
  lastMeet: Set<string>;
  lastRest: Set<string>;
};

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
/** Kunci kelompok 4 orang (urutan pemain tidak berpengaruh) — tanpa salin & sort array di jalur panas. */
function groupKey(a: string, b: string, c: string, d: string) {
  if (a > b) [a, b] = [b, a];
  if (c > d) [c, d] = [d, c];
  if (a > c) [a, c] = [c, a];
  if (b > d) [b, d] = [d, b];
  if (b > c) [b, c] = [c, b];
  return `${a}|${b}|${c}|${d}`;
}
const pairsOf = (four: string[]) => four.flatMap((x, i) => four.slice(i + 1).map((y) => pairKey(x, y)));

function emptyHistory(players: string[]): History {
  return { games: new Map(players.map((p) => [p, 0])), partners: new Map(), opponents: new Map(), groups: new Map(), lastMeet: new Set(), lastRest: new Set() };
}

function record(h: History, matches: LineupMatch[], players: string[]) {
  const playing = new Set<string>();
  const met = new Set<string>();
  for (const m of matches) {
    const four = [...m.a, ...m.b];
    for (const p of four) {
      playing.add(p);
      bump(h.games, p);
    }
    bump(h.partners, pairKey(...m.a));
    bump(h.partners, pairKey(...m.b));
    for (const x of m.a) for (const y of m.b) bump(h.opponents, pairKey(x, y));
    bump(h.groups, groupKey(four[0], four[1], four[2], four[3]));
    for (const k of pairsOf(four)) met.add(k);
  }
  h.lastRest = new Set(players.filter((p) => !playing.has(p)));
  h.lastMeet = met;
}

// Bobot penalti: kelompok 4 orang yang sama >> selisih level tim (Rotating) ≈ partner berulang >
// rest dua kali berturut-turut > bertemu lagi di ronde berikutnya > lawan berulang. 1–2 orang bertemu
// lagi masih wajar (penalti kecil); rest dua kali lebih mahal dari satu pertemuan ulang.
const COST = { sameGroup: 60, partner: 10, level: 10, restTwice: 8, metLastRound: 4, opponent: 1 };

/** Bagian penalti court yang sama untuk ketiga pembagian tim + ke-6 kunci pasangannya. */
type CourtBase = { k12: string; k13: string; k14: string; k23: string; k24: string; k34: string; group: number; allOpp: number };

/**
 * Bagian kelompok: kelompok 4 orang yang sama & pasangan yang bertemu lagi dari ronde lalu. Ke-6
 * pasangan dihitung sekali: tiap pasangan jadi partner di satu pembagian dan lawan di dua lainnya,
 * jadi penalti lawan satu pembagian = total lawan ke-6 pasangan − lawan dari 2 pasangan partnernya.
 */
function courtBase(h: History, p1: string, p2: string, p3: string, p4: string): CourtBase {
  const k12 = pairKey(p1, p2), k13 = pairKey(p1, p3), k14 = pairKey(p1, p4), k23 = pairKey(p2, p3), k24 = pairKey(p2, p4), k34 = pairKey(p3, p4);
  let group = COST.sameGroup * (h.groups.get(groupKey(p1, p2, p3, p4)) ?? 0);
  let allOpp = 0;
  for (const k of [k12, k13, k14, k23, k24, k34]) {
    if (h.lastMeet.has(k)) group += COST.metLastRound;
    allOpp += h.opponents.get(k) ?? 0;
  }
  return { k12, k13, k14, k23, k24, k34, group, allOpp };
}

/**
 * Penalti court untuk pembagian [a1, a2] vs [b1, b2] (partner `ka`/`kb`) — satu-satunya rumus penalti
 * court (planRound memilih, lineupCost menilai): kelompok + partner berulang + lawan berulang + selisih
 * level tim (Rotating).
 */
function splitCost(h: History, base: CourtBase, a1: string, a2: string, b1: string, b2: string, ka: string, kb: string, levels?: LevelWeights) {
  const level = levels ? COST.level * Math.abs((levels[a1] ?? 3) + (levels[a2] ?? 3) - (levels[b1] ?? 3) - (levels[b2] ?? 3)) : 0;
  const partners = (h.partners.get(ka) ?? 0) + (h.partners.get(kb) ?? 0);
  const opponents = base.allOpp - (h.opponents.get(ka) ?? 0) - (h.opponents.get(kb) ?? 0);
  return base.group + COST.partner * partners + COST.opponent * opponents + level;
}

/** Penalti court untuk pembagian tim yang sudah ditentukan. */
function courtCost(h: History, [a1, a2]: [string, string], [b1, b2]: [string, string], levels?: LevelWeights) {
  const base = courtBase(h, a1, a2, b1, b2);
  return splitCost(h, base, a1, a2, b1, b2, base.k12, base.k34, levels);
}

/** Pembagian tim termurah untuk 4 pemain di satu court + penaltinya (seri → pembagian pertama). */
function bestCourt(h: History, p1: string, p2: string, p3: string, p4: string, levels?: LevelWeights): { a: [string, string]; b: [string, string]; cost: number } {
  const base = courtBase(h, p1, p2, p3, p4);
  const c0 = splitCost(h, base, p1, p2, p3, p4, base.k12, base.k34, levels);
  const c1 = splitCost(h, base, p1, p3, p2, p4, base.k13, base.k24, levels);
  const c2 = splitCost(h, base, p1, p4, p2, p3, base.k14, base.k23, levels);
  if (c0 <= c1 && c0 <= c2) return { a: [p1, p2], b: [p3, p4], cost: c0 };
  if (c1 <= c2) return { a: [p1, p3], b: [p2, p4], cost: c1 };
  return { a: [p1, p4], b: [p2, p3], cost: c2 };
}

function planRound(h: History, players: string[], courts: number, round: number, rand: () => number, levels?: LevelWeights): LineupMatch[] {
  // Jumlah main tetap serata mungkin: yang paling sedikit main pasti main; dari yang seri di batas
  // (mis. 8 pemain 1 court: semua seri) dipilih kombinasi dengan penalti terkecil — bukan selalu yang
  // baru rest, karena itu membuat kelompok 4 orang yang sama terus bertemu bergantian.
  const need = courts * 4;
  const order = shuffle(players, rand).sort((x, y) => (h.games.get(x) ?? 0) - (h.games.get(y) ?? 0));
  const cutoff = h.games.get(order[need - 1]) ?? 0;
  const must = order.filter((p) => (h.games.get(p) ?? 0) < cutoff);
  const pool = order.filter((p) => (h.games.get(p) ?? 0) === cutoff);
  // Yang rest ronde lalu dan rest lagi sekarang: semua di atas batas + sisa pool yang tidak terpilih.
  const restedAgain = (p: string) => (h.lastRest.has(p) ? 1 : 0);
  const aboveRestTwice = order.filter((p) => (h.games.get(p) ?? 0) > cutoff).reduce((n, p) => n + restedAgain(p), 0);

  let best: LineupMatch[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 80; attempt++) {
    const sp = shuffle(pool, rand);
    const take = need - must.length;
    const s = shuffle([...must, ...sp.slice(0, take)], rand);
    const matches: LineupMatch[] = [];
    let cost = COST.restTwice * (aboveRestTwice + sp.slice(take).reduce((n, p) => n + restedAgain(p), 0));
    for (let c = 0; c < courts; c++) {
      const { a, b, cost: cc } = bestCourt(h, s[c * 4], s[c * 4 + 1], s[c * 4 + 2], s[c * 4 + 3], levels);
      matches.push({ round, court: c + 1, a, b });
      cost += cc;
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
  return cost + 25 * (Math.max(...games, 0) - Math.min(...games, 0)) + COST.restTwice * restStreak;
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

  // Ronde yang dipertahankan cukup diputar ulang sekali; tiap percobaan mulai dari salinannya.
  const keep = history.filter((m) => m.round < fromRound);
  const base = emptyHistory(players);
  for (const r of [...new Set(keep.map((m) => m.round))].sort((x, y) => x - y)) {
    record(base, keep.filter((m) => m.round === r), players);
  }
  let best: LineupMatch[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const h: History = {
      games: new Map(base.games),
      partners: new Map(base.partners),
      opponents: new Map(base.opponents),
      groups: new Map(base.groups),
      lastMeet: base.lastMeet,
      lastRest: base.lastRest,
    };
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
