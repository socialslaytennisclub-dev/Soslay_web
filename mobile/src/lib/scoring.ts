/**
 * Skor tenis dihitung ulang dari daftar poin (A/B) — undo cukup membuang poin terakhir,
 * dan data yang disimpan kecil (hanya urutan poin).
 */
export type Side = "A" | "B";
export type MatchFormat = { sets: 1 | 3; games: 4 | 6; noAd: boolean };
export type SetScore = { a: number; b: number; tiebreak?: { a: number; b: number } };
export type MatchState = {
  sets: SetScore[];
  /** Poin game berjalan: "0" | "15" | "30" | "40" | "AD" | angka tiebreak. */
  point: { a: string; b: string };
  inTiebreak: boolean;
  server: Side;
  winner: Side | null;
  /** Label situasi: "Deuce", "Break point", "Set point", "Match point". */
  situation: string | null;
};

export const FORMATS: { label: string; value: MatchFormat }[] = [
  { label: "1 set · 6 game", value: { sets: 1, games: 6, noAd: false } },
  { label: "Best of 3", value: { sets: 3, games: 6, noAd: false } },
  { label: "1 set · 4 game", value: { sets: 1, games: 4, noAd: true } },
];

const LABEL = ["0", "15", "30", "40"];
const other = (s: Side): Side => (s === "A" ? "B" : "A");

export function computeMatch(points: Side[], format: MatchFormat, firstServer: Side = "A"): MatchState {
  const setsToWin = Math.ceil(format.sets / 2);
  const sets: SetScore[] = [{ a: 0, b: 0 }];
  let game = { a: 0, b: 0 };
  let server: Side = firstServer;
  let tbFirstServer: Side = firstServer;
  let winner: Side | null = null;
  const setsWon = () => ({
    a: sets.filter((s) => setWinner(s, format) === "A").length,
    b: sets.filter((s) => setWinner(s, format) === "B").length,
  });

  for (const p of points) {
    if (winner) break;
    const set = sets[sets.length - 1];
    const tiebreak = set.a === format.games && set.b === format.games;
    const key = p === "A" ? "a" : "b";
    const okey = p === "A" ? "b" : "a";
    game[key]++;
    let gameWon = false;
    if (tiebreak) {
      const total = game.a + game.b;
      if (game[key] >= 7 && game[key] - game[okey] >= 2) gameWon = true;
      // Tiebreak: servis pertama 1 poin, lalu berganti tiap 2 poin.
      else server = Math.floor((total + 1) / 2) % 2 === 0 ? tbFirstServer : other(tbFirstServer);
    } else if (format.noAd) {
      if (game[key] >= 4) gameWon = true;
    } else if (game[key] >= 4 && game[key] - game[okey] >= 2) gameWon = true;

    if (gameWon) {
      if (tiebreak) {
        set.tiebreak = { ...game };
        server = other(tbFirstServer);
      } else server = other(server);
      set[key]++;
      game = { a: 0, b: 0 };
      if (setWinner(set, format)) {
        const won = setsWon();
        if (won.a === setsToWin) winner = "A";
        else if (won.b === setsToWin) winner = "B";
        else sets.push({ a: 0, b: 0 });
      }
      const next = sets[sets.length - 1];
      if (next.a === format.games && next.b === format.games) tbFirstServer = server;
    }
  }

  const set = sets[sets.length - 1];
  const inTiebreak = !winner && set.a === format.games && set.b === format.games;
  let point: MatchState["point"];
  if (inTiebreak) point = { a: String(game.a), b: String(game.b) };
  else if (!format.noAd && game.a >= 3 && game.b >= 3) {
    point = game.a === game.b ? { a: "40", b: "40" } : game.a > game.b ? { a: "AD", b: "40" } : { a: "40", b: "AD" };
  } else point = { a: LABEL[Math.min(game.a, 3)], b: LABEL[Math.min(game.b, 3)] };

  return { sets, point, inTiebreak, server, winner, situation: winner ? null : situation(sets, game, format, server, inTiebreak, setsToWin) };
}

export function setWinner(set: SetScore, f: MatchFormat): Side | null {
  const { a, b } = set;
  if (set.tiebreak) return set.tiebreak.a > set.tiebreak.b ? "A" : "B";
  if (a >= f.games && a - b >= 2) return "A";
  if (b >= f.games && b - a >= 2) return "B";
  if (a === f.games + 1 && b === f.games - 1) return "A";
  if (b === f.games + 1 && a === f.games - 1) return "B";
  return null;
}

/** Apakah poin berikutnya untuk `side` memenangkan game berjalan? */
function winsGameNext(side: Side, game: { a: number; b: number }, f: MatchFormat, tiebreak: boolean) {
  const me = side === "A" ? game.a : game.b;
  const op = side === "A" ? game.b : game.a;
  if (tiebreak) return me + 1 >= 7 && me + 1 - op >= 2;
  if (f.noAd) return me === 3;
  return me >= 3 && me + 1 - op >= 2;
}

function situation(sets: SetScore[], game: { a: number; b: number }, f: MatchFormat, server: Side, tiebreak: boolean, setsToWin: number) {
  const set = sets[sets.length - 1];
  const wonSets = (s: Side) => sets.slice(0, -1).filter((x) => setWinner(x, f) === s).length;
  for (const side of ["A", "B"] as Side[]) {
    if (!winsGameNext(side, game, f, tiebreak)) continue;
    const games = { ...set, [side === "A" ? "a" : "b"]: set[side === "A" ? "a" : "b"] + 1 };
    const winsSet = tiebreak || setWinner(games, f) === side;
    if (winsSet && wonSets(side) + 1 === setsToWin) return "Match point";
    if (winsSet) return "Set point";
    if (side !== server) return "Break point";
  }
  if (!tiebreak && !f.noAd && game.a >= 3 && game.a === game.b) return "Deuce";
  return null;
}

/** Ringkasan skor set, mis. "6-4 3-6 7-6". */
export const scoreLine = (s: MatchState) =>
  s.sets.filter((x) => x.a + x.b > 0).map((x) => `${x.a}-${x.b}`).join("  ") || "0-0";
