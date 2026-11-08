/**
 * Peringkat final & bonus juara (Figma Simplify · Akhiri Activity). Aturan urutan sama dengan
 * leaderboard dan finish_session di database: mode Point = total poin → selisih skor → menang; mode
 * Win = menang → selisih skor → total poin. Kalau nilai utama sama, yang selisihnya lebih besar (lebih
 * produktif) di atas; nilai sama persis berbagi peringkat. Bonus juara hanya untuk pemain yang sudah main.
 */

/**
 * Bonus juara 1 / 2 / 3 activity baru (diatur per activity, kolom sessions.podium_bonus — default kolom
 * sama, dicek di check-migrations). Activity yang dibuat sebelum aturan per activity: kolom NULL =
 * aturan lama 100 / 75 / 50 (session_podium_bonus di database).
 */
export const DEFAULT_PODIUM_BONUS = [10, 0, 0] as const;
export const LEGACY_PODIUM_BONUS = [100, 75, 50] as const;
/** Poin review sesi bila Aturan poin belum pernah disimpan — sama dengan review_bonus_points() di database
 *  (dicek di check-migrations) dan default Aturan poin admin. */
export const DEFAULT_REVIEW_POINTS = 10;
export type PodiumBonus = [number, number, number];

/** Kolom podium_bonus → tuple, atau null untuk aturan lama (NULL). */
export const toPodiumBonus = (v: readonly number[] | null | undefined): PodiumBonus | null => (v?.length === 3 ? [v[0], v[1], v[2]] : null);

/** Bonus yang benar-benar dibagikan: aturan lama (null) → 100 / 75 / 50. */
export const effectivePodiumBonus = (v: PodiumBonus | null): PodiumBonus => v ?? [...LEGACY_PODIUM_BONUS];

/** "juara 1 +10" / "juara 1 +100 · juara 2 +75 · juara 3 +50"; null kalau semuanya 0. */
export function podiumBonusText(bonus: readonly number[]): string | null {
  const parts = bonus.map((pts, i) => (pts > 0 ? `juara ${i + 1} +${pts}` : null)).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** points = total skor tim di match yang dimainkan; diff = selisih skor (skor sendiri − lawan). */
type Standing = { points: number; wins: number; diff: number; played: number };

type Mode = "points" | "wins";

/**
 * Urutan penentu peringkat — satu-satunya definisi (pembanding, deteksi seri, teks aturan diturunkan
 * dari sini; finish_session di database memakai urutan yang sama).
 */
const RANK_ORDER: Record<Mode, readonly ("points" | "diff" | "wins")[]> = { points: ["points", "diff", "wins"], wins: ["wins", "diff", "points"] };

const FIELD_LABEL = { points: "total poin", diff: "selisih skor (+/−)", wins: "jumlah menang" } as const;

/** "Menang sama → selisih skor (+/−), lalu total poin" — urutan penentu kalau nilai utama sama. */
export const tieRule = (mode: Mode) => {
  const [first, second, third] = RANK_ORDER[mode];
  return `${first === "wins" ? "Menang" : "Poin"} sama → ${FIELD_LABEL[second]}, lalu ${FIELD_LABEL[third]}`;
};

/** Pembanding sort (terbaik dulu) sesuai RANK_ORDER; 0 = seri penuh. */
export function compareStandings(x: Standing, y: Standing, mode: Mode) {
  for (const f of RANK_ORDER[mode]) {
    const d = y[f] - x[f];
    if (d) return d;
  }
  return 0;
}

/** Nilai utama yang ditampilkan di tabel (menang / poin). */
export const rankValue = (s: Standing, mode: Mode) => s[RANK_ORDER[mode][0]];

export type Ranked<S extends Standing> = { s: S; rank: number; tie: boolean; value: number };

/**
 * Peringkat dengan seri (nilai sama persis berbagi nomor). `standings` sudah terurut (lihat standingsOf).
 * Peringkat final & bonus: pemain tanpa match berskor tidak diberi peringkat; leaderboard live
 * menampilkan semua (`includeUnplayed`).
 */
export function finalRanks<S extends Standing>(standings: S[], mode: Mode, { includeUnplayed = false } = {}): Ranked<S>[] {
  const rows = includeUnplayed ? standings : standings.filter((s) => s.played > 0);
  const out: Ranked<S>[] = [];
  rows.forEach((s, i) => {
    const prev = out[i - 1];
    const same = prev !== undefined && compareStandings(prev.s, s, mode) === 0;
    out.push({ s, rank: same ? prev.rank : i + 1, tie: same, value: rankValue(s, mode) });
    if (same) prev.tie = true;
  });
  return out;
}


/**
 * Slay Point sesi (ringkasan host), sama dengan yang dicatat database: poin hadir untuk member yang
 * check-in + bonus juara peringkat 1–3 untuk member (peserta tanpa akun tidak dapat poin). Bonus
 * juara dibagikan saat sesi ditutup ("Akhiri Activity" atau tutup otomatis setelah jeda) → `withBonus`
 * false selama penutupan itu belum tercatat.
 */
export function sessionPoints(
  { people, standings, format }: { people: { id: string; checkedIn: boolean; member: boolean }[]; standings: (Standing & { id: string })[]; format: { attendancePoints: number; leaderboardMode: "points" | "wins"; podiumBonus: readonly number[] } },
  withBonus = true,
) {
  const present = people.filter((p) => p.checkedIn).length;
  const members = new Set(people.filter((p) => p.member).map((p) => p.id));
  const earning = people.filter((p) => p.checkedIn && p.member).length;
  const bonus = withBonus ? finalRanks(standings, format.leaderboardMode).reduce((sum, r) => sum + (members.has(r.s.id) ? (format.podiumBonus[r.rank - 1] ?? 0) : 0), 0) : 0;
  return { present, earning, bonus, total: earning * format.attendancePoints + bonus };
}
