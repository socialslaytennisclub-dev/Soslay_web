"use client";

import { Check, Lock, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { generateLineup, playableCourts, type LineupMatch } from "@/lib/americano";
import { cx } from "@/lib/cx";
import { isUnstarted, type RoundPlan } from "@/lib/rounds";
import { firstName, teamName } from "@/lib/text";
import type { MemberSessionDetail } from "@/server/member/session-detail";
import { saveHostLineup, type HostLineupMatch } from "@/server/member/actions";
import { maxRound } from "./LiveCards";
import styles from "./SessionDetail.module.css";

type Slot = "a1" | "a2" | "b1" | "b2";
const SLOTS: Slot[] = ["a1", "a2", "b1", "b2"];
type Draft = HostLineupMatch & { locked: boolean };

const toDraft = (d: MemberSessionDetail): Draft[] =>
  d.matches.map((m) => {
    const [a1, a2, b1, b2] = m.playerIds;
    return { round_no: m.round, court_no: m.court, a1, a2, b1, b2, locked: m.scoreA !== null };
  });

/**
 * Acak ulang · prioritaskan yang hadir (Figma Simplify HL-1e): ronde `fromRound`…terakhir diisi
 * ulang hanya dengan peserta yang sudah check-in; ronde sebelumnya tetap & ikut dihitung supaya
 * partner tidak berulang. null = pemain hadir kurang dari 4.
 */
export function shuffleFromRound(d: MemberSessionDetail, fromRound: number): HostLineupMatch[] | null {
  const players = d.people.filter((p) => p.checkedIn).map((p) => p.id);
  const rounds = maxRound(d);
  if (!playableCourts(players.length, d.format.courts)) return null;
  const history: LineupMatch[] = d.matches
    .filter((m) => m.round < fromRound)
    .map((m) => ({ round: m.round, court: m.court, a: [m.playerIds[0], m.playerIds[1]], b: [m.playerIds[2], m.playerIds[3]] }));
  return generateLineup({ players, courts: d.format.courts, rounds }, { fromRound, history }).map((m) => ({
    round_no: m.round,
    court_no: m.court,
    a1: m.a[0],
    a2: m.a[1],
    b1: m.b[0],
    b2: m.b[1],
  }));
}

/** "Atur line-up" di Panel Host (HL-1d) + "Acak ulang · prioritaskan yang hadir" (HL-1e). */
export function LineupButton({ detail: d, plan }: { detail: MemberSessionDetail; plan: RoundPlan }) {
  const router = useRouter();
  const { dialogRef, open: showDialog, close, onBackdropClick } = useDialog();
  const [view, setView] = useState<"edit" | "shuffle">("edit");
  const [draft, setDraft] = useState<Draft[]>([]);
  const [round, setRound] = useState(d.currentRound ?? plan.rounds[0]);
  const [shuffled, setShuffled] = useState<HostLineupMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const nameOf = new Map(d.people.map((p) => [p.id, p.name]));
  const present = d.people.filter((p) => p.checkedIn);
  const absent = d.people.filter((p) => !p.checkedIn);
  const editable = (r: number) => r === d.currentRound || isUnstarted(plan.statusOf(r));
  const shuffleFrom = (d.currentRound ?? 0) + 1;

  const openDialog = () => {
    setDraft(toDraft(d));
    setRound(d.currentRound ?? plan.rounds[0]);
    setView("edit");
    setError(null);
    showDialog();
  };

  const reshuffle = () => {
    const result = shuffleFromRound(d, shuffleFrom);
    setShuffled(result);
    setError(result ? null : "Minimal 4 peserta harus sudah check-in untuk mengacak ulang.");
  };

  const persist = (fromRound: number, matches: HostLineupMatch[]) =>
    startBusy(async () => {
      const result = await saveHostLineup(d.id, fromRound, matches);
      if (!result.ok) return setError(result.error);
      close();
      router.refresh();
    });

  const saveDraft = () => {
    const open = plan.rounds.filter(editable);
    if (!open.length) return setError("Tidak ada ronde yang masih bisa diubah.");
    const from = Math.min(...open);
    const rows = draft.filter((m) => m.round_no >= from && !m.locked).map((m) => ({ round_no: m.round_no, court_no: m.court_no, a1: m.a1, a2: m.a2, b1: m.b1, b2: m.b2 }));
    for (const r of new Set(draft.map((m) => m.round_no))) {
      const ids = draft.filter((m) => m.round_no === r).flatMap((m) => SLOTS.map((s) => m[s]));
      if (new Set(ids).size !== ids.length) return setError(`Ada pemain yang main dua kali di Ronde ${r}.`);
    }
    persist(from, rows);
  };

  const setSlot = (court: number, slot: Slot, id: string) =>
    setDraft((rows) => rows.map((m) => (m.round_no === round && m.court_no === court ? { ...m, [slot]: id } : m)));

  const courts = draft.filter((m) => m.round_no === round);
  const playing = new Set(courts.flatMap((m) => SLOTS.map((s) => m[s])));
  const resting = d.people.filter((p) => !playing.has(p.id));
  const preview = shuffled?.filter((m) => m.round_no === shuffleFrom) ?? [];
  const previewPlaying = new Set(preview.flatMap((m) => SLOTS.map((s) => m[s])));
  const restingPresent = present.filter((p) => !previewPlaying.has(p.id));

  return (
    <>
      <button type="button" className={styles.btnOutlineSm} onClick={openDialog}>
        Atur line-up
      </button>
      <dialog ref={dialogRef} className={cx(styles.qrDialog, styles.wideDialog)} aria-labelledby="lineup-title" onClick={onBackdropClick}>
        <div className={styles.qrPanel}>
          {view === "edit" ? (
            <>
              <header className={styles.qrHead}>
                <div>
                  <h2 id="lineup-title">Atur line-up</h2>
                  <span className={styles.muted}>Bisa diubah untuk court yang belum ada skornya dan ronde berikutnya.</span>
                </div>
                <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
                  <X size={18} />
                </button>
              </header>

              <div className={styles.presenceBar}>
                <span>
                  ✓ {present.length} sudah hadir · {absent.length} belum hadir
                </span>
                {shuffleFrom <= plan.rounds.at(-1)! && (
                  <button
                    type="button"
                    className={styles.btnOutlineSm}
                    onClick={() => {
                      reshuffle();
                      setView("shuffle");
                    }}
                  >
                    <RefreshCw size={14} aria-hidden />
                    Acak ulang · prioritaskan yang hadir
                  </button>
                )}
              </div>

              <div className={styles.lineupTabs} role="tablist" aria-label="Ronde">
                {plan.rounds.map((r) => (
                  <button key={r} type="button" role="tab" aria-selected={r === round} className={cx(styles.lineupTab, r === round && styles.lineupTabOn)} onClick={() => setRound(r)}>
                    {!editable(r) && <Lock size={12} aria-hidden />}
                    {plan.statusOf(r) === "live" && <span className={styles.chipDot} aria-hidden />}R{r}
                  </button>
                ))}
              </div>

              {courts.map((m) => {
                const locked = m.locked || !editable(round);
                return (
                  <fieldset key={m.court_no} className={styles.lineupCourt} disabled={locked}>
                    <legend>
                      Court {m.court_no}
                      <span className={cx(styles.roundPill, locked ? styles.roundPill_later : styles.roundPill_done)}>
                        {m.locked ? "Skor sudah masuk · terkunci" : locked ? "Ronde terkunci" : "Belum ada skor · bisa diubah"}
                      </span>
                    </legend>
                    <div className={styles.lineupSlots}>
                      {SLOTS.map((slot, i) => (
                        <span key={slot} className={styles.lineupSlot}>
                          {i === 2 && <b className={styles.lineupVs}>vs</b>}
                          <select aria-label={`Court ${m.court_no} · pemain ${i + 1}`} value={m[slot]} onChange={(e) => setSlot(m.court_no, slot, e.target.value)}>
                            {d.people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.checkedIn ? "" : " (belum hadir)"}
                              </option>
                            ))}
                          </select>
                        </span>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              {resting.length > 0 && (
                <div className={styles.restList}>
                  <span className={styles.endLabel}>
                    Rest di Ronde {round} · {resting.length} pemain
                  </span>
                  <div>
                    {resting.map((p) => (
                      <span key={p.id}>{firstName(p.name)}</span>
                    ))}
                  </div>
                </div>
              )}
              <p className={styles.small}>Peserta melihat line-up baru di halaman Live & Ronde setelah disimpan.</p>
            </>
          ) : (
            <>
              <header className={styles.qrHead}>
                <div>
                  <h2 id="lineup-title">Acak ulang line-up</h2>
                  <span className={styles.muted}>
                    {d.currentRound ? `R${d.currentRound} sedang dimainkan · ` : ""}R{shuffleFrom}–R{plan.rounds.at(-1)} diacak ulang
                  </span>
                </div>
                <button type="button" className={styles.qrClose} onClick={() => setView("edit")} aria-label="Kembali">
                  <X size={18} />
                </button>
              </header>
              <p className={styles.presenceChips}>
                <span className={styles.chipDone}>✓ {present.length} sudah hadir</span>
                <span className={styles.chipWarn}>{absent.length} belum hadir</span>
              </p>
              {preview.length > 0 && (
                <div className={styles.shufflePreview}>
                  <strong>
                    Ronde {shuffleFrom} · {preview.length} court · hanya yang sudah hadir
                  </strong>
                  {preview.map((m) => (
                    <span key={m.court_no}>
                      <b>C{m.court_no}</b> {teamName([nameOf.get(m.a1) ?? "", nameOf.get(m.a2) ?? ""])} <i>vs</i> {teamName([nameOf.get(m.b1) ?? "", nameOf.get(m.b2) ?? ""])}
                    </span>
                  ))}
                  {restingPresent.length > 0 && (
                    <small>
                      Rest R{shuffleFrom} (sudah hadir): {restingPresent.map((p) => firstName(p.name)).join(", ")}
                    </small>
                  )}
                </div>
              )}
              {absent.length > 0 && (
                <div className={styles.restList}>
                  <span className={styles.endLabel}>Belum hadir — tidak masuk acakan; acak ulang lagi setelah mereka check-in</span>
                  <div>
                    {absent.map((p) => (
                      <span key={p.id} className={styles.restWarn}>
                        {firstName(p.name)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className={styles.small}>
                R1–R{shuffleFrom - 1} tidak berubah. Court yang sudah berskor tidak ikut diacak.
              </p>
            </>
          )}

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}
          <div className={styles.qrActions}>
            {view === "edit" ? (
              <>
                <button type="button" className={styles.btnOutline} onClick={close}>
                  Batal
                </button>
                <button type="button" className={styles.btnLime} onClick={saveDraft} disabled={busy}>
                  <Check size={16} aria-hidden />
                  {busy ? "Menyimpan…" : "Simpan line-up"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.btnOutline} onClick={reshuffle}>
                  Acak lagi
                </button>
                <button type="button" className={styles.btnLime} onClick={() => shuffled && persist(shuffleFrom, shuffled)} disabled={busy || !shuffled}>
                  {busy ? "Menyimpan…" : "Pakai acakan ini"}
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
