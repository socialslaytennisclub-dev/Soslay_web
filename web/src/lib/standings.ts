/**
 * Peringkat final & bonus juara (Figma Simplify · Akhiri Activity). Aturan urutan sama dengan
 * leaderboard dan finish_session di database: mode Point = total poin → selisih skor → menang; mode
 * Win = menang → total poin → selisih skor. Kalau total poin sama, yang selisihnya lebih besar (lebih
 * produktif) di atas; nilai sama persis berbagi peringkat. Bonus juara hanya untuk pemain yang sudah main.
 */

export const PODIUM_BONUS = [100, 75, 50] as const;

/** points = total skor tim di match yang dimainkan; diff = selisih skor (skor sendiri − lawan). */
type Standing = { points: number; wins: number; diff: number; played: number };

/** Urutan penentu peringkat (lihat komentar file): Point = poin, selisih, menang · Win = menang, poin, selisih. */
export const rankKey = (s: Standing, mode: "points" | "wins") => (mode === "wins" ? [s.wins, s.points, s.diff] : [s.points, s.diff, s.wins]);

/** Selisih skor untuk tabel: +12 / −3 / 0. */
export const formatDiff = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Pembanding sort (terbaik dulu) sesuai rankKey. */
export function compareStandings(x: Standing, y: Standing, mode: "points" | "wins") {
  const [a, b] = [rankKey(x, mode), rankKey(y, mode)];
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
}

export type Ranked<S extends Standing> = { s: S; rank: number; tie: boolean; value: number };

/** `standings` sudah terurut (lihat standingsOf); pemain tanpa match berskor tidak diberi peringkat. */
export function finalRanks<S extends Standing>(standings: S[], mode: "points" | "wins"): Ranked<S>[] {
  const key = (s: S) => rankKey(s, mode);
  const played = standings.filter((s) => s.played > 0);
  const out: Ranked<S>[] = [];
  played.forEach((s, i) => {
    const prev = out[i - 1];
    const same = prev && key(prev.s).join() === key(s).join();
    out.push({ s, rank: same ? prev.rank : i + 1, tie: false, value: key(s)[0] });
    if (same) out[i].tie = prev.tie = true;
  });
  return out;
}

const podiumBonus = (rank: number) => PODIUM_BONUS[rank - 1] ?? 0;

/**
 * Slay Point sesi (ringkasan host), sama dengan yang dicatat database: poin hadir untuk member yang
 * check-in + bonus juara peringkat 1–3 untuk member (peserta tanpa akun tidak dapat poin). Bonus
 * juara dibagikan saat sesi ditutup ("Akhiri Activity" atau tutup otomatis setelah jeda) → `withBonus`
 * false selama penutupan itu belum tercatat.
 */
export function sessionPoints(
  { people, standings, format }: { people: { id: string; checkedIn: boolean; member: boolean }[]; standings: (Standing & { id: string })[]; format: { attendancePoints: number; leaderboardMode: "points" | "wins" } },
  withBonus = true,
) {
  const present = people.filter((p) => p.checkedIn).length;
  const members = new Set(people.filter((p) => p.member).map((p) => p.id));
  const earning = people.filter((p) => p.checkedIn && p.member).length;
  const bonus = withBonus ? finalRanks(standings, format.leaderboardMode).reduce((sum, r) => sum + (members.has(r.s.id) ? podiumBonus(r.rank) : 0), 0) : 0;
  return { present, earning, bonus, total: earning * format.attendancePoints + bonus };
}
