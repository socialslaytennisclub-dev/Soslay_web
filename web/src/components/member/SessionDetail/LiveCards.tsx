import { Info } from "lucide-react";
import { cx } from "@/lib/cx";
import { isUnstarted, planRounds, ROUND_STATUS_LABEL, skippedLabel, type RoundPlan } from "@/lib/rounds";
import { initials, teamName } from "@/lib/text";
import type { DetailMatch, MemberSessionDetail } from "@/server/member/session-detail";
import { ScoreRulesButton } from "./LiveActions";
import styles from "./SessionDetail.module.css";

/**
 * Kartu atas tab Live. Dipakai halaman (server) untuk peserta dan Panel Host (client) untuk host —
 * host bisa memilih ronde di Panel Host, dan kartu ini ikut menampilkan ronde yang dipilih.
 */

/** Peserta terdaftar yang belum dijadwalkan di line-up (mis. diimpor setelah line-up disimpan). */
export const NOT_IN_LINEUP = "Kamu belum masuk line-up — hubungi host untuk dimasukkan ke ronde berikutnya.";

export const maxRound = (d: MemberSessionDetail) => Math.max(d.format.rounds, ...d.matches.map((m) => m.round));

export const planOf = (d: MemberSessionDetail) => planRounds(d.matches, d.currentRound, d.startedRounds, d.phase);

/** Match dari sisi member yang login: tim sendiri vs lawan (rest → sisi A). */
export function perspective(m: DetailMatch) {
  const a = m.mySide !== "b";
  const own = a ? m.scoreA : m.scoreB;
  const opp = a ? m.scoreB : m.scoreA;
  return { own: a ? m.a : m.b, opp: a ? m.b : m.a, score: own === null || opp === null ? null : { own, opp } };
}

/** Avatar inisial bertumpuk untuk satu tim (Figma UIF-07). */
function TeamFaces({ team }: { team: string[] }) {
  return (
    <span className={styles.teamFaces} aria-hidden>
      {team.map((n, i) => (
        <span key={i} className={cx(styles.miniFace, styles[`face${i % 4}`])}>
          {initials(n)}
        </span>
      ))}
    </span>
  );
}

/** Dua tim berhadapan; `mirror` → tim kanan rata kanan (avatar di sisi luar). */
function Versus({ left, right, badge, mirror = false }: { left: { label: string; team: string[] }; right: { label: string; team: string[] }; badge: string; mirror?: boolean }) {
  return (
    <div className={styles.versus}>
      <div className={styles.teamCard}>
        <TeamFaces team={left.team} />
        <span>
          <small className={styles.teamLabelMine}>{left.label}</small>
          <strong>{teamName(left.team)}</strong>
        </span>
      </div>
      <span className={styles.vsBadge}>{badge}</span>
      <div className={cx(styles.teamCard, mirror && styles.teamCardEnd)}>
        {!mirror && <TeamFaces team={right.team} />}
        <span>
          <small>{right.label}</small>
          <strong>{teamName(right.team)}</strong>
        </span>
        {mirror && <TeamFaces team={right.team} />}
      </div>
    </div>
  );
}

/** Teks kembali ke ronde live saat host sedang melihat ronde lain. */
const backToLive = (d: MemberSessionDetail) =>
  d.phase === "live" && d.currentRound !== null ? `Ronde ${d.currentRound} sedang live — pilih R${d.currentRound} di Panel Host untuk kembali.` : null;

/** Kartu match member yang ikut main untuk ronde `round` (peserta: selalu ronde live). */
export function PlayerLiveCard({ detail: d, round, plan = planOf(d), total = maxRound(d) }: { detail: MemberSessionDetail; round: number; plan?: RoundPlan; total?: number }) {
  const done = d.phase === "done";
  const isLive = !done && round === d.currentRound;
  const status = plan.statusOf(round);
  const skipped = skippedLabel(plan.skipped);
  const now = d.matches.find((m) => m.round === round && m.mySide);
  // Match berikutnya mengikuti urutan main: ronde terkecil yang belum dimulai (termasuk yang dilewati).
  const next = isLive && !now ? d.matches.find((m) => m.mySide && m.scoreA === null && isUnstarted(plan.statusOf(m.round))) : undefined;
  const shown = now ?? next;
  const view = shown ? perspective(shown) : null;
  // Word joiner (U+2060) di sekitar "–": skor tidak terpotong ke baris baru di judul.
  const scoreText = view?.score ? `${view.score.own}⁠–⁠${view.score.opp}` : null;

  const title = !d.plays
    ? d.phase === "done"
      ? "Sesi sudah selesai"
      : "Kamu belum masuk line-up"
    : isLive
    ? now
      ? scoreText
        ? `Match kamu selesai · ${scoreText}`
        : `Kamu sedang main di Court ${now.court}`
      : `Kamu rest di Ronde ${round}`
    : !d.isHost
      ? "Sesi sudah selesai"
      : now
        ? scoreText
          ? `Ronde ${round} · Match kamu ${scoreText}`
          : `Ronde ${round} · Court ${now.court} · ${isUnstarted(status) ? "belum dimulai" : "belum ada skor"}`
        : `Kamu rest di Ronde ${round}`;
  const eyebrow = isLive
    ? `Sedang berlangsung · Ronde ${round} dari ${total}${skipped ? ` · ${skipped}` : ""}`
    : done
      ? d.isHost
        ? `Sesi selesai · Ronde ${round} dari ${total}`
        : "Sesi selesai"
      : `Melihat Ronde ${round} dari ${total} · ${ROUND_STATUS_LABEL[status]}`;
  const back = isLive ? null : backToLive(d);

  return (
    <section className={styles.liveCard2} aria-labelledby="live-title">
      <header className={styles.liveHead}>
        <span className={styles.eyebrowDark}>{eyebrow}</span>
        {isLive && <span className={styles.livePillRed}>Live</span>}
      </header>
      <h2 id="live-title" className={styles.bannerTitle}>
        {title}
      </h2>
      {back && <p className={styles.liveNext}>{back}</p>}
      {shown && view && (
        <>
          {!now && (
            <p className={styles.liveNext}>
              Match berikutnya: Ronde {shown.round} · Court {shown.court}
            </p>
          )}
          <Versus left={{ label: "Tim kamu", team: view.own }} right={{ label: "Lawan", team: view.opp }} badge={scoreText ?? "VS"} />
        </>
      )}
      {!d.plays && d.phase !== "done" && <p className={styles.liveNext}>{NOT_IN_LINEUP}</p>}
      {d.plays && !shown && isLive && <p className={styles.liveNext}>Kamu tidak punya match lagi di line-up. Cek tab Ronde untuk court lain.</p>}
      <div className={styles.liveActions}>
        <ScoreRulesButton target={d.format.targetPoints} mode={d.format.leaderboardMode} />
        <span className={styles.liveNote}>
          <Info size={14} aria-hidden />
          {d.isHost ? "Sebagai host, input skor match-mu lewat Panel Host di bawah." : "Skor masuk leaderboard setelah diinput & diverifikasi host."}
        </span>
      </div>
    </section>
  );
}

/** Kartu untuk host yang tidak ikut main (HL-1): semua court di ronde `round` (default ronde live). */
export function HostLiveCard({ detail: d, round, plan = planOf(d), total = maxRound(d) }: { detail: MemberSessionDetail; round: number; plan?: RoundPlan; total?: number }) {
  const isLive = d.phase === "live" && round === d.currentRound;
  const courts = d.matches.filter((m) => m.round === round);
  const back = isLive ? null : backToLive(d);
  return (
    <section className={styles.liveCard2} aria-labelledby="live-title">
      <header className={styles.liveHead}>
        <span id="live-title" className={styles.eyebrowDark}>
          {isLive ? (
            <>
              Sedang berlangsung · Ronde {round} dari {total}
              {plan.skipped.length > 0 && ` · ${skippedLabel(plan.skipped)?.replace("dilewati", "belum dimulai")}`}
            </>
          ) : d.phase === "done" ? (
            `Sesi selesai · Ronde ${round} dari ${total}`
          ) : (
            `Melihat Ronde ${round} dari ${total} · ${ROUND_STATUS_LABEL[plan.statusOf(round)]}`
          )}
        </span>
        {isLive && <span className={styles.livePillRed}>Live</span>}
      </header>
      {back && <p className={styles.liveNext}>{back}</p>}
      {courts.map((m) => (
        <div key={m.court} className={styles.liveCourt}>
          <h3>
            Court {m.court} · {m.scoreA !== null ? `Selesai ${m.scoreA}–${m.scoreB}` : isLive ? "Live" : isUnstarted(plan.statusOf(round)) ? "Belum dimulai" : "Belum ada skor"}
          </h3>
          <Versus left={{ label: "Tim A", team: m.a }} right={{ label: "Tim B", team: m.b }} badge="VS" mirror />
        </div>
      ))}
      <div className={styles.liveActions}>
        <ScoreRulesButton target={d.format.targetPoints} mode={d.format.leaderboardMode} />
        <span className={styles.liveNote}>
          <Info size={14} aria-hidden />
          Kamu host sesi ini (tidak ikut main). Skor tiap court diinput lewat Panel Host di bawah — peserta tidak menginput skor.
        </span>
      </div>
    </section>
  );
}
