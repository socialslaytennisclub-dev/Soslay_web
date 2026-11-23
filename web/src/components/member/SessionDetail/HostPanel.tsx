"use client";

import { Lock, Minus, Play, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { useScoreDraft } from "@/hooks/useScoreDraft";
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
  const isPlayer = d.plays;
  const total = maxRound(d);
  // Kartu atas selalu ronde live (Figma 1284:6086); chip hanya mengganti ronde yang dilihat di Panel Host.
  const cardRound = d.phase === "live" && d.currentRound !== null ? d.currentRound : selected;
  const notice = useRoundChangeNotice(d);
  return (
    <>
      {isPlayer ? <PlayerLiveCard detail={d} round={cardRound} plan={plan} total={total} /> : <HostLiveCard detail={d} round={cardRound} plan={plan} total={total} />}
      <HostPanel detail={d} plan={plan} total={total} selected={selected} onPick={(round) => setPicked({ round, at: d.currentRound })} isPlayer={isPlayer} notice={notice} />
    </>
  );
}

/**
 * Ronde live berganti (skor court terakhir masuk → pindah otomatis, atau "Lanjut") → pemberitahuan singkat.
 * Tidak muncul saat halaman pertama kali dibuka.
 */
function useRoundChangeNotice(d: MemberSessionDetail): string | null {
  const previous = useRef(d.currentRound);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const from = previous.current;
    previous.current = d.currentRound;
    if (from === null || d.currentRound === null || d.currentRound <= from || d.phase !== "live") return;
    const complete = d.matches.filter((m) => m.round === from).every((m) => m.scoreA !== null);
    setNotice(`${complete ? `Skor R${from} lengkap ✓ · ` : ""}Ronde ${d.currentRound} dimulai — peserta melihat line-up barunya.`);
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [d.currentRound, d.phase, d.matches]);
  return notice;
}

/**
 * Panel Host (Figma Simplify HL-1…HL-5): chip ronde untuk melihat court tiap ronde, "Mulai Ronde
 * N" = ronde dipilih + 1 (pilih chip sebelum ronde tujuan untuk melompat; ronde yang terlewat tetap
 * belum dimulai), "Input skor" lewat modal + Urungkan, Atur line-up / Acak ulang, dan Akhiri
 * Activity. Hanya satu ronde live; hak host & total = target dicek ulang di database.
 */
function HostPanel({
  detail: d,
  plan,
  total,
  selected,
  onPick,
  isPlayer,
  notice,
}: {
  detail: MemberSessionDetail;
  plan: RoundPlan;
  total: number;
  selected: number;
  onPick: (round: number) => void;
  isPlayer: boolean;
  notice: string | null;
}) {
  const { matches, currentRound, canScore } = d;
  const target = d.format.targetPoints;
  const router = useRouter();
  const { dialogRef: scoreRef, open: openScore, close: closeScore, onBackdropClick: onScoreBackdrop } = useDialog();
  const { dialogRef: endRef, open: openEnd, close: closeEnd, onBackdropClick: onEndBackdrop } = useDialog();
  const { dialogRef: nextRef, open: openNext, close: closeNext, onBackdropClick: onNextBackdrop } = useDialog();
  const [editing, setEditing] = useState<DetailMatch | null>(null);
  // Tanpa target (Rotating Partner): skor tim B diisi sendiri, tidak dihitung dari target.
  const { a: scoreA, b: scoreB, max, valid, setA: setScoreA, setB: setScoreB, reset: resetScore } = useScoreDraft(target);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const live = canScore && d.phase === "live";
  const viewingUnstarted = isUnstarted(plan.statusOf(selected));
  // Ronde berurutan: satu-satunya ronde yang bisa dimulai = ronde tepat setelah ronde live.
  const nextRound = currentRound !== null ? (plan.rounds.find((r) => r > currentRound) ?? null) : null;
  const courts = matches.filter((m) => m.round === selected);
  const liveCourts = matches.filter((m) => m.round === currentRound);
  const liveUnscored = liveCourts.filter((m) => m.scoreA === null);

  const startRound = (round: number) =>
    startBusy(async () => {
      const result = await startHostRound(d.id, round);
      if (!result.ok) return setError(result.error);
      setError(null);
      closeEnd();
      closeNext();
      router.refresh();
    });

  const edit = (m: DetailMatch) => {
    setEditing(m);
    resetScore(m.scoreA, m.scoreB);
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
        </div>
        {live && (
          <div className={styles.hostActions}>
            <LineupButton detail={d} plan={plan} />
          </div>
        )}
      </header>

      {plan.rounds.length > 1 && (
        <>
          <RoundChips plan={plan} selected={selected} onPick={onPick} />
          <ChipLegend />
        </>
      )}

      {notice && (
        <p className={styles.hostSaved} role="status">
          <span>{notice}</span>
        </p>
      )}

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
        <RoundBar
          plan={plan}
          round={selected}
          courts={courts}
          isLive={selected === currentRound}
          nextRound={nextRound}
          busy={busy}
          onContinue={() => (liveUnscored.length ? openNext() : nextRound !== null && startRound(nextRound))}
        />
      )}

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

      <dialog ref={nextRef} className={styles.qrDialog} aria-labelledby="next-round-title" onClick={onNextBackdrop}>
        {nextRound !== null && (
          <div className={styles.qrPanel}>
            <header className={styles.qrHead}>
              <div>
                <h2 id="next-round-title">Lanjut ke Ronde {nextRound}?</h2>
                <span className={styles.muted}>
                  Ronde {currentRound} masih {liveUnscored.length} court belum ada skor ({liveUnscored.map((m) => `Court ${m.court}`).join(", ")}).
                </span>
              </div>
              <button type="button" className={styles.qrClose} onClick={closeNext} aria-label="Tutup">
                <X size={18} />
              </button>
            </header>
            <p className={styles.small}>
              Ronde {currentRound} jadi &quot;belum lengkap&quot; (chip oranye). Skornya masih bisa diisi nanti lewat chip R{currentRound} selama activity belum diakhiri.
            </p>
            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.qrActions}>
              <button type="button" className={styles.btnOutline} onClick={closeNext}>
                Batal
              </button>
              <button type="button" className={styles.btnLime} onClick={() => startRound(nextRound)} disabled={busy}>
                <Play size={14} aria-hidden fill="currentColor" />
                {busy ? "Memulai…" : `Ya, lanjut ke R${nextRound}`}
              </button>
            </div>
          </div>
        )}
      </dialog>

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
              { label: "Tim A", team: editing.a, value: scoreA, set: setScoreA },
              { label: "Tim B", team: editing.b, value: scoreB, set: setScoreB },
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
                  <button type="button" aria-label={`Tambah skor ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
                    <Plus size={16} />
                  </button>
                </span>
              </div>
            ))}
            <p className={styles.totalRow}>
              <span>{target === null ? "Skor match" : "Total poin match"}</span>
              <span className={styles.totalOk}>{target === null ? (scoreA + scoreB > 0 ? `✓ ${scoreA}–${scoreB} · siap disimpan` : "Isi skor kedua tim") : `✓ ${target} / ${target} · siap disimpan`}</span>
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
              <button type="button" className={styles.btnNavy} onClick={save} disabled={busy || !valid}>
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

/** Keterangan warna chip ronde. */
function ChipLegend() {
  return (
    <p className={styles.chipLegend}>
      <span className={styles.chipLegendDone}>Selesai</span>
      <span className={styles.chipLegendLive}>Live</span>
      <span className={styles.chipLegendWarn}>Belum lengkap</span>
      <span className={styles.chipLegendLater}>Belum dimulai</span>
    </p>
  );
}

/**
 * Bar status ronde yang sedang dilihat (Figma 1284:6086): ringkasan court + status / aksi. Ronde berjalan
 * berurutan dan pindah otomatis saat skor court terakhir masuk; "Lanjut ke Ronde N" hanya untuk ronde live
 * yang macet (ada court tanpa skor). Ronde terakhir lengkap → diakhiri lewat tombol Akhiri Activity.
 */
function RoundBar({
  plan,
  round,
  courts,
  isLive,
  nextRound,
  busy,
  onContinue,
}: {
  plan: RoundPlan;
  round: number;
  courts: DetailMatch[];
  isLive: boolean;
  nextRound: number | null;
  busy: boolean;
  onContinue: () => void;
}) {
  const status = plan.statusOf(round);
  const unscored = courts.filter((m) => m.scoreA === null).length;
  const summary = isUnstarted(status)
    ? `${courts.length} court belum dimulai`
    : unscored
      ? `${unscored} court belum ada skor`
      : `${courts.length} court selesai`;

  let state: React.ReactNode;
  if (isLive && !unscored) {
    state =
      nextRound !== null ? (
        <button type="button" className={styles.btnStart} onClick={onContinue} disabled={busy}>
          <Play size={14} aria-hidden fill="currentColor" />
          {busy ? "Memulai…" : `Lanjut ke Ronde ${nextRound}`}
        </button>
      ) : (
        <span className={cx(styles.roundBarState, styles.roundBarDone)}>
          <Lock size={14} aria-hidden /> Semua ronde selesai
        </span>
      );
  } else if (isLive) {
    state = (
      <span className={cx(styles.roundBarState, styles.roundBarLive)}>
        <span className={styles.chipDot} aria-hidden /> Sedang berlangsung
      </span>
    );
  } else if (isUnstarted(status)) {
    state = <span className={cx(styles.roundBarState, styles.roundBarDone)}>Belum dimulai</span>;
  } else if (unscored) {
    state = <span className={cx(styles.roundBarState, styles.roundBarWarn)}>Belum lengkap · isi skor</span>;
  } else {
    state = (
      <span className={cx(styles.roundBarState, styles.roundBarDone)}>
        <Lock size={14} aria-hidden /> Ronde selesai
      </span>
    );
  }

  return (
    <div className={styles.roundBar}>
      <div className={styles.roundBarMain}>
        <span className={styles.roundBarInfo}>
          <small>{summary}</small>
          <strong>Ronde {round}</strong>
        </span>
        {state}
      </div>
      {isLive && unscored > 0 && nextRound !== null && (
        <button type="button" className={cx(styles.linkBtn, styles.roundBarLink)} onClick={onContinue} disabled={busy}>
          Court macet? Lanjut ke Ronde {nextRound} tanpa menunggu skor →
        </button>
      )}
      {isLive && !unscored && nextRound === null && <small className={styles.roundBarHint}>Tekan &quot;Akhiri Activity&quot; di bawah untuk menutup sesi &amp; melihat hasil.</small>}
    </div>
  );
}
