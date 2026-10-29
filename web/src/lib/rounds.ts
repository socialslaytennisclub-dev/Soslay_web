/**
 * Status ronde Americano (Figma UIF-13 · Host Mulai & Lompat Ronde). Dipakai Panel Host dan tab
 * Live / Ronde peserta supaya semua melihat status yang sama.
 *
 * Ronde dianggap "sudah dimulai" bila host menekan "Mulai Ronde" (started_rounds), sudah ada
 * skornya, atau sedang live. Ronde bernomor lebih kecil dari ronde terjauh yang sudah dimulai,
 * yang belum pernah dimulai → Dilewati; ronde berikutnya = nomor terkecil yang belum dimulai.
 */

export type RoundStatus = "done" | "live" | "partial" | "skipped" | "next" | "later";

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  done: "Selesai",
  live: "Live",
  partial: "Belum lengkap",
  skipped: "Dilewati",
  next: "Berikutnya",
  later: "Belum mulai",
};

/** Ronde yang belum pernah dimulai (Berikutnya / Belum mulai / Dilewati) — bisa di-"Mulai Ronde". */
export const isUnstarted = (status: RoundStatus) => status === "next" || status === "later" || status === "skipped";

type RoundMatch = { round: number; scoreA: number | null };

export type RoundPlan = {
  rounds: number[];
  /** Status tiap ronde di `rounds` (ronde di luar line-up → "later"). */
  statusOf: (round: number) => RoundStatus;
  /** Pilihan default "Mulai Ronde": nomor terkecil yang belum dimulai (termasuk yang dilewati). */
  next: number | null;
  skipped: number[];
};

export function planRounds(matches: RoundMatch[], current: number | null, started: number[], phase: "upcoming" | "live" | "done"): RoundPlan {
  // Satu lintasan: jumlah court & court berskor per ronde.
  const count = new Map<number, { total: number; scored: number }>();
  for (const m of matches) {
    const c = count.get(m.round) ?? { total: 0, scored: 0 };
    c.total++;
    if (m.scoreA !== null) c.scored++;
    count.set(m.round, c);
  }
  const rounds = [...count.keys()].sort((a, b) => a - b);
  const complete = (r: number) => count.get(r)!.scored === count.get(r)!.total;
  const begun = new Set([...started, ...rounds.filter((r) => count.get(r)!.scored > 0)]);
  if (current !== null && phase === "live") begun.add(current);
  const furthest = begun.size ? Math.max(...begun) : 0;
  const next = rounds.find((r) => !begun.has(r) && !complete(r)) ?? null;

  const statusFor = (r: number): RoundStatus => {
    if (complete(r)) return "done";
    if (r === current && phase !== "done") return phase === "live" ? "live" : "next";
    if (begun.has(r) || phase === "done") return "partial";
    if (r < furthest) return "skipped";
    return r === next && phase === "live" ? "next" : "later";
  };
  const status = new Map(rounds.map((r) => [r, statusFor(r)]));
  return {
    rounds,
    statusOf: (r) => status.get(r) ?? "later",
    next,
    skipped: rounds.filter((r) => status.get(r) === "skipped"),
  };
}

/** "R4 & R8" — daftar ronde untuk label & banner. */
export const roundList = (rounds: number[]) => rounds.map((r) => `R${r}`).join(" & ");

/** "R8 dilewati" / "R4 & R8 dilewati" — null bila tidak ada. */
export const skippedLabel = (skipped: number[]) => (skipped.length ? `${roundList(skipped)} dilewati` : null);
