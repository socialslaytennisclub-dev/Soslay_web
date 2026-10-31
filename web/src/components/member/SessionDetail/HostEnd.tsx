"use client";

import { AlertTriangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MouseEvent, RefObject } from "react";
import { formatAngka } from "@/lib/format";
import { isUnstarted, type RoundPlan } from "@/lib/rounds";
import { PODIUM_BONUS, sessionPoints } from "@/lib/standings";
import type { MemberSessionDetail } from "@/server/member/session-detail";
import { endHostActivity } from "@/server/member/actions";
import { Podium } from "./Results";
import styles from "./SessionDetail.module.css";

const rangeLabel = (rounds: number[]) => (rounds.length > 1 && rounds.at(-1)! - rounds[0] === rounds.length - 1 ? `${rounds[0]}–${rounds.at(-1)}` : rounds.join(" & "));

/**
 * Konfirmasi Akhiri Activity (Figma Simplify HL-5a): ronde yang belum dimulai & match tanpa skor
 * tidak masuk hasil, peringkat final, Slay Point yang dibagikan (hadir + bonus juara). Setelah
 * diakhiri skor terkunci; halaman pindah ke tab Hasil.
 */
export function EndActivityDialog({
  detail: d,
  plan,
  dialogRef,
  onClose,
  onBackdropClick,
  onStartRound,
  busy: starting,
}: {
  detail: MemberSessionDetail;
  plan: RoundPlan;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onBackdropClick: (event: MouseEvent<HTMLDialogElement>) => void;
  onStartRound: (round: number) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const unstarted = plan.rounds.filter((r) => isUnstarted(plan.statusOf(r)));
  const lostMatches = d.matches.filter((m) => unstarted.includes(m.round)).length;
  const done = plan.rounds.filter((r) => plan.statusOf(r) === "done").length;
  const unscored = d.matches.filter((m) => m.scoreA === null && !unstarted.includes(m.round));
  const unscoredRounds = [...new Set(unscored.map((m) => m.round))];
  const { present, earning, total } = sessionPoints(d);
  const firstUnstarted = unstarted[0];

  const confirm = () =>
    startBusy(async () => {
      const result = await endHostActivity(d.id);
      if (!result.ok) return setError(result.error);
      onClose();
      router.replace(`?tab=hasil&ended=${d.people.length}`, { scroll: false });
      router.refresh();
    });

  return (
    <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="end-title" onClick={onBackdropClick}>
      <div className={styles.qrPanel}>
        <header className={styles.qrHead}>
          <div>
            <h2 id="end-title">Akhiri activity?</h2>
            <span className={styles.muted}>
              {d.title} · {done} dari {plan.rounds.length} ronde selesai{d.currentRound ? ` · Ronde ${d.currentRound} live` : ""}
            </span>
          </div>
          <button type="button" className={styles.qrClose} onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>

        {unstarted.length > 0 && (
          <div className={styles.endWarn}>
            <AlertTriangle size={18} aria-hidden />
            <span>
              <strong>Ronde {rangeLabel(unstarted)} belum dimulai</strong>
              {lostMatches} match di R{rangeLabel(unstarted)} tidak masuk hasil. Peringkat final &amp; Slay Point dihitung dari ronde yang sudah dimainkan. Kamu tetap bisa mengakhiri activity.
              <button type="button" className={styles.linkBtn} onClick={() => onStartRound(firstUnstarted)} disabled={starting}>
                Mulai Ronde {firstUnstarted} dulu →
              </button>
            </span>
          </div>
        )}

        <ul className={styles.endChecklist}>
          {unscored.length > 0 && (
            <li>
              <span aria-hidden>!</span>
              {unscored.length} match belum ada skor · Ronde {unscoredRounds.join(", ")} (Court {[...new Set(unscored.map((m) => m.court))].join(" & ")})
            </li>
          )}
          <li>
            <span aria-hidden>{present === d.people.length ? "✓" : "!"}</span>
            <span>
              {present}/{d.people.length} peserta check-in
              {present < d.people.length && <small>{d.people.length - present} peserta tidak hadir tidak mendapat Slay Point</small>}
            </span>
          </li>
        </ul>

        <Podium detail={d} />

        <div className={styles.pointsCard}>
          <span>Slay Point yang dibagikan</span>
          <strong>{formatAngka(total)} pts</strong>
          <small>
            +{d.format.attendancePoints} × {earning} member hadir · bonus juara +{PODIUM_BONUS.join(" / +")} (member saja)
          </small>
        </div>

        <p className={styles.endNote}>Setelah diakhiri, skor terkunci &amp; hasil langsung tampil untuk peserta. Koreksi hanya lewat admin.</p>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.qrActions}>
          <button type="button" className={styles.btnOutline} onClick={onClose}>
            Tinjau dulu
          </button>
          <button type="button" className={styles.btnLime} onClick={confirm} disabled={busy}>
            {busy ? "Mengakhiri…" : "Tetap akhiri activity"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
