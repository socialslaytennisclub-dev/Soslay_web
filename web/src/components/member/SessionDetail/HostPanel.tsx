"use client";

import { Minus, Play, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { isUnstarted, roundList, roundStatusWord, type RoundPlan, type RoundStatus } from "@/lib/rounds";
import { teamName } from "@/lib/text";
import type { DetailMatch, MemberSessionDetail } from "@/server/member/session-detail";
import { clearHostScore, startHostRound, submitHostScore } from "@/server/member/actions";
import { EndActivityDialog } from "./HostEnd";
import { LineupButton } from "./HostLineup";
import { HostLiveCard, maxRound, planOf, PlayerLiveCard } from "./LiveCards";
import styles from "./SessionDetail.module.css";

type Saved = { matchId: string; round: number; court: number; label: string; previous: { a: number; b: number } | null };

/** Chip ronde R1…Rn (Figma Simplify HL-1): warna mengikuti status; ronde live bertitik merah. */
const CHIP: Record<RoundStatus, string> = {
  done: styles.chipDone,
  live: styles.chipLive,
  partial: styles.chipWarn,
  skipped: styles.chipWarn,
  next: styles.chipLater,
  later: styles.chipLater,
};

/**
 * Tab Live host: kartu atas + Panel Host berbagi ronde yang dipilih, jadi kartu ikut menampilkan
 * ronde yang sedang dilihat / diinput skornya. Host yang tidak punya match → kartu semua court.
 */
export function HostLive({ detail: d }: { detail: MemberSessionDetail }) {
  const plan = planOf(d);
  // Chip pilihan berlaku selama ronde live belum berganti; setelah itu kembali ke ronde live.
  const [picked, setPicked] = useState<{ round: number; at: number | null } | null>(null);
  // Ronde pilihan yang hilang dari line-up (mis. setelah Atur line-up) → kembali ke ronde live.
  const valid = picked && picked.at === d.currentRound && plan.rounds.includes(picked.round) ? picked.round : null;
  const selected = valid ?? d.currentRound ?? plan.rounds[0];
  const isPlayer = d.matches.some((m) => m.mySide);
  const total = maxRound(d);
  return (
    <>
      {isPlayer ? <PlayerLiveCard detail={d} round={selected} plan={plan} total={total} /> : <HostLiveCard detail={d} round={selected} plan={plan} total={total} />}
      <HostPanel detail={d} plan={plan} total={total} selected={selected} onPick={(round) => setPicked({ round, at: d.currentRound })} isPlayer={isPlayer} />
    </>
  );
}

/**
 * Panel Host (Figma Simplify HL-1…HL-5): chip ronde untuk melihat court tiap ronde, "Mulai Ronde
 * N" = ronde dipilih + 1 (pilih chip sebelum ronde tujuan untuk melompat; ronde yang terlewat tetap
 * belum dimulai), "Input skor" lewat modal + Urungkan, Atur line-up / Acak ulang, dan Akhiri
 * Activity. Hanya satu ronde live; hak host & total = target dicek ulang di database.
 */
function HostPanel({ detail: d, plan, total, selected, onPick, isPlayer }: { detail: MemberSessionDetail; plan: RoundPlan; total: number; selected: number; onPick: (round: number) => void; isPlayer: boolean }) {
  const { matches, currentRound, canScore } = d;
  const target = d.format.targetPoints;
  const router = useRouter();
  const { dialogRef: scoreRef, open: openScore, close: closeScore, onBackdropClick: onScoreBackdrop } = useDialog();
  const { dialogRef: endRef, open: openEnd, close: closeEnd, onBackdropClick: onEndBackdrop } = useDialog();
  const [editing, setEditing] = useState<DetailMatch | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const live = canScore && d.phase === "live";
  const viewingUnstarted = isUnstarted(plan.statusOf(selected));
  const next = plan.rounds.includes(selected + 1) && isUnstarted(plan.statusOf(selected + 1)) ? selected + 1 : null;
  const last = selected === plan.rounds.at(-1);
  const courts = matches.filter((m) => m.round === selected);
  const scoreB = target - scoreA;

  const startRound = (round: number) =>
    startBusy(async () => {
      const result = await startHostRound(d.id, round);
      if (!result.ok) return setError(result.error);
      setError(null);
      closeEnd();
      router.refresh();
    });

  const edit = (m: DetailMatch) => {
    setEditing(m);
    setScoreA(m.scoreA ?? Math.ceil(target / 2));
    setError(null);
    openScore();
  };

  const save = () =>
    startBusy(async () => {
      if (!editing?.id) return;
      const result = await submitHostScore(editing.id, scoreA, scoreB);
      if (!result.ok) return setError(result.error);
      setSaved({
        matchId: editing.id,
        round: editing.round,
        court: editing.court,
        label: `${teamName(editing.a)} ${scoreA}–${scoreB}`,
        previous: editing.scoreA === null || editing.scoreB === null ? null : { a: editing.scoreA, b: editing.scoreB },
      });
      closeScore();
      setEditing(null);
      router.refresh();
    });

  const undo = () =>
    startBusy(async () => {
      if (!saved) return;
      const result = saved.previous ? await submitHostScore(saved.matchId, saved.previous.a, saved.previous.b) : await clearHostScore(saved.matchId);
      if (!result.ok) return setError(result.error);
      setSaved(null);
      router.refresh();
    });

  // Lewat jam selesai tanpa "Akhiri Activity" (phase done) → tidak ada ronde yang "sedang live".
  const status =
    d.phase === "live" && selected === currentRound
      ? `Ronde ${currentRound} dari ${total} sedang live${plan.skipped.length ? ` · ${roundList(plan.skipped)} belum dimulai` : ""}`
      : `${d.phase === "done" ? `Jam sesi sudah lewat · Ronde ${selected} dari ${total}` : `Melihat Ronde ${selected}`} · ${roundStatusWord(plan.statusOf(selected))}`;

  return (
    <section className={styles.hostPanel} aria-labelledby="host-panel-title">
      <header className={styles.hostHead}>
        <div>
          <h2 id="host-panel-title" className={styles.cardTitle}>
            Panel Host <span className={styles.hostBadge}>Host</span>
          </h2>
          <p className={styles.muted}>
            {isPlayer ? "Kamu host sesi ini dan juga bermain" : "Kamu host sesi ini dan tidak ikut bermain"} · {status}
          </p>
          {selected !== currentRound && (
            // Di HP kartu atas berada jauh di atas chip — beri tahu & bawa ke sana.
            <button type="button" className={styles.linkBtn} onClick={() => document.getElementById("live-title")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })}>
              Kartu di atas menampilkan Ronde {selected} ↑
            </button>
          )}
        </div>
        {live && (
          <div className={styles.hostActions}>
            <LineupButton detail={d} plan={plan} />
            {next ? (
              <button type="button" className={styles.btnStart} onClick={() => startRound(next)} disabled={busy}>
                <Play size={14} aria-hidden fill="currentColor" />
                {busy ? "Memulai…" : `Mulai Ronde ${next}`}
              </button>
            ) : (
              last && (
                <button type="button" className={styles.btnStart} onClick={openEnd}>
                  <Play size={14} aria-hidden fill="currentColor" />
                  Akhiri Activity
                </button>
              )
            )}
          </div>
        )}
      </header>

      {plan.rounds.length > 1 && <RoundChips plan={plan} selected={selected} onPick={onPick} />}

      {live && plan.skipped.length > 0 && <SkippedBanner skipped={plan.skipped} />}

      {saved && (
        <p className={styles.hostSaved} role="status">
          <span>
            Skor Ronde {saved.round} · Court {saved.court} tersimpan &amp; terverifikasi · {saved.label}. Leaderboard sudah diperbarui.
          </span>
          <button type="button" onClick={undo} disabled={busy}>
            Urungkan
          </button>
        </p>
      )}
      {error && !editing && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.hostCourts}>
        {courts.map((m) => {
          const scored = m.scoreA !== null;
          return (
            <li key={m.court} className={styles.hostCourt}>
              <div className={styles.hostCourtTag}>
                <strong>Court {m.court}</strong>
                <span className={cx(styles.roundPill, scored ? styles.roundPill_done : styles.roundPill_later)}>{scored ? "Terverifikasi" : "Belum ada skor"}</span>
                {m.mySide && <span className={styles.matchYou}>Match kamu</span>}
              </div>
              <div className={styles.hostTeams}>
                <span>
                  {teamName(m.a)}
                  <b>{m.scoreA ?? "–"}</b>
                </span>
                <span>
                  {teamName(m.b)}
                  <b>{m.scoreB ?? "–"}</b>
                </span>
              </div>
              {canScore && m.id && (
                <button
                  type="button"
                  className={scored ? styles.btnOutline : styles.btnNavy}
                  onClick={() => edit(m)}
                  disabled={viewingUnstarted}
                  title={viewingUnstarted ? `Ronde ${selected} belum dimulai` : undefined}
                >
                  {scored ? "Ubah skor" : "Input skor"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.small}>
        {canScore ? "Skor yang diinput host langsung final & masuk leaderboard. Peserta tidak menginput skor." : "Sesi sudah diakhiri — skor terkunci. Hubungi admin untuk koreksi."}
      </p>

      {live && (
        <div className={styles.endRow}>
          <span>
            <strong>Selesai bermain?</strong>
            Activity bisa diakhiri walau belum semua ronde dimainkan atau skor diinput. Kamu akan melihat ringkasan dulu.
          </span>
          <button type="button" className={styles.btnDanger} onClick={openEnd}>
            Akhiri Activity
          </button>
        </div>
      )}

      <EndActivityDialog detail={d} plan={plan} dialogRef={endRef} onClose={closeEnd} onBackdropClick={onEndBackdrop} onStartRound={startRound} busy={busy} />

      <dialog ref={scoreRef} className={styles.qrDialog} aria-labelledby="score-title" onClick={onScoreBackdrop}>
        {editing && (
          <div className={styles.qrPanel}>
            <header className={styles.qrHead}>
              <div>
                <h2 id="score-title">Input Skor · Court {editing.court}</h2>
                <span className={styles.scoreChip}>Ronde {editing.round} · diinput host</span>
              </div>
              <button type="button" className={styles.qrClose} onClick={closeScore} aria-label="Tutup">
                <X size={18} />
              </button>
            </header>
            {[
              { label: "Tim A", team: editing.a, value: scoreA, set: (v: number) => setScoreA(v) },
              { label: "Tim B", team: editing.b, value: scoreB, set: (v: number) => setScoreA(target - v) },
            ].map(({ label, team, value, set }) => (
              <div key={label} className={styles.stepRow}>
                <span className={styles.stepTeam}>
                  <small>{label}</small>
                  {teamName(team)}
                </span>
                <span className={styles.stepper}>
                  <button type="button" aria-label={`Kurangi skor ${label}`} disabled={value <= 0} onClick={() => set(value - 1)}>
                    <Minus size={16} />
                  </button>
                  <strong>{value}</strong>
                  <button type="button" aria-label={`Tambah skor ${label}`} disabled={value >= target} onClick={() => set(value + 1)}>
                    <Plus size={16} />
                  </button>
                </span>
              </div>
            ))}
            <p className={styles.totalRow}>
              <span>Total poin match</span>
              <span className={styles.totalOk}>
                ✓ {target} / {target} · siap disimpan
              </span>
            </p>
            <div className={styles.verifyNote}>
              <ShieldCheck size={18} aria-hidden />
              <span>
                <strong>Skor dari host langsung final</strong>
                Skor ini langsung masuk leaderboard. Pastikan sesuai hasil di lapangan.
              </span>
            </div>
            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.qrActions}>
              <button type="button" className={styles.btnOutline} onClick={closeScore}>
                Batal
              </button>
              <button type="button" className={styles.btnNavy} onClick={save} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan skor"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

function RoundChips({ plan, selected, onPick }: { plan: RoundPlan; selected: number; onPick: (round: number) => void }) {
  return (
    <div className={styles.roundChips} role="tablist" aria-label="Pilih ronde">
      {plan.rounds.map((r) => {
        const status = plan.statusOf(r);
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === selected}
            className={cx(styles.roundChip, CHIP[status], r === selected && styles.chipOn)}
            onClick={() => onPick(r)}
          >
            {status === "live" && <span className={styles.chipDot} aria-hidden />}R{r}
            <span className="visually-hidden"> · {roundStatusWord(status)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ronde yang dilompati (HL-1c): cara memainkannya + peringatan saat Akhiri Activity. */
function SkippedBanner({ skipped }: { skipped: number[] }) {
  const [first] = skipped;
  return (
    <p className={styles.skipBanner}>
      <strong>Ronde {skipped.join(" & ")} belum dimulai</strong>
      Untuk memainkannya: pilih chip {first > 1 ? `R${first - 1}` : "ronde sebelumnya"} lalu &quot;Mulai Ronde {first}&quot;. Kalau langsung Akhiri Activity, {roundList(skipped)} tidak masuk hasil.
    </p>
  );
}
