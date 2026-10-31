import { Camera, Check, ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { formatAngka, formatTanggalPendek } from "@/lib/format";
import { isUnstarted, roundList } from "@/lib/rounds";
import { finalRanks, PODIUM_BONUS, type Ranked, sessionPoints } from "@/lib/standings";
import { initials, teamName } from "@/lib/text";
import type { MemberSessionDetail } from "@/server/member/session-detail";
import { perspective, planOf } from "./LiveCards";
import styles from "./SessionDetail.module.css";

const PHOTO_SLA_MS = 24 * 3_600_000;
const TOP = 10;

const endedAt = (d: MemberSessionDetail) => d.ended?.at ?? d.endsAt;
/** Batas unggah foto sesi (SLA 1×24 jam setelah selesai). */
const photoDue = (d: MemberSessionDetail) => new Date(new Date(endedAt(d)).getTime() + PHOTO_SLA_MS).toISOString();

/** 3 besar peringkat final — dipakai konfirmasi Akhiri Activity & hasil host. */
export function Podium({ detail: d }: { detail: MemberSessionDetail }) {
  const podium = finalRanks(d.standings, d.format.leaderboardMode).filter((r) => r.rank <= 3);
  if (!podium.length) return null;
  const unit = d.format.leaderboardMode === "wins" ? "menang" : "poin";
  return (
    <div className={styles.endPodium}>
      <span className={styles.endLabel}>Peringkat final</span>
      <ol>
        {podium.map(({ s, rank, value }) => (
          <li key={s.id}>
            <span className={styles[`podium${rank}`]}>{rank}</span>
            <strong>{s.name}</strong>
            <small>
              {value} {unit}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Tab Hasil peserta (Figma Simplify S3-P · 2): hasil kamu, peringkat final, match kamu. */
export function ResultsTab({ detail: d }: { detail: MemberSessionDetail }) {
  const ranks = finalRanks(d.standings, d.format.leaderboardMode);
  const mine = ranks.find((r) => r.s.me);
  const me = d.standings.find((s) => s.me);
  const myMatches = d.matches.filter((m) => m.mySide && m.scoreA !== null).map((m) => ({ ...m, ...perspective(m) }));
  const won = myMatches.filter(({ score }) => score && score.own > score.opp).length;
  const earned = d.myPoints.reduce((sum, p) => sum + p.delta, 0);
  const wins = d.format.leaderboardMode === "wins";

  return (
    <>
      <section className={styles.resultCard} aria-labelledby="hasil-title">
        <div className={styles.resultHead}>
          {mine && (
            <span className={styles.resultRank}>
              <strong>#{mine.rank}</strong>
              <small>dari {ranks.length}</small>
            </span>
          )}
          <span>
            <small className={styles.resultEyebrow}>Hasil kamu</small>
            <h2 id="hasil-title">{mine ? (mine.rank <= 3 ? `Mantap! Kamu finish di peringkat ${mine.rank}` : `Kamu finish di peringkat ${mine.rank}`) : "Terima kasih sudah ikut main!"}</h2>
            <small>Skor terverifikasi host · {formatTanggalPendek(endedAt(d), d.city, "dateTime")}</small>
          </span>
        </div>
        <div className={styles.resultStats}>
          {[
            ["Match", myMatches.length],
            ["Menang", won],
            ["Kalah", myMatches.length - won],
            ["Total poin", me?.points ?? 0],
          ].map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
          ))}
          <span>
            <small>Slay Point</small>
            <strong className={styles.resultPts}>{earned ? `+${formatAngka(earned)}` : "–"}</strong>
          </span>
        </div>
      </section>

      {ranks.length > 0 && <FinalBoard detail={d} ranks={ranks} />}

      {myMatches.length > 0 && (
        <section className={styles.card} aria-labelledby="match-kamu-title">
          <h2 id="match-kamu-title" className={styles.cardTitle}>
            Match kamu
          </h2>
          <ul className={styles.myMatches}>
            {myMatches.map((m) => {
              const { own, opp } = m;
              const { own: o, opp: p } = m.score ?? { own: 0, opp: 0 };
              return (
                <li key={`${m.round}-${m.court}`}>
                  <span className={styles.myMatchWhen}>
                    <strong>Ronde {m.round}</strong>
                    <small>Court {m.court}</small>
                  </span>
                  <span className={styles.myMatchTeams}>
                    <strong>{teamName(own)}</strong>
                    <small>vs {teamName(opp)}</small>
                  </span>
                  <b>
                    {o} – {p}
                  </b>
                  <span className={o > p ? styles.chipWin : o < p ? styles.chipLose : styles.chipLater}>{o > p ? "Menang" : o < p ? "Kalah" : "Seri"}</span>
                </li>
              );
            })}
          </ul>
          <p className={styles.small}>{wins ? "Peringkat diurutkan dari jumlah menang, lalu total poin." : "Poin individu = skor tim kamu di setiap match yang kamu mainkan."}</p>
        </section>
      )}
    </>
  );
}

/** Peringkat final (navy, Figma S3-P): 10 teratas + baris kamu, sisanya dibuka lewat "Lihat lengkap". */
function FinalBoard({ detail: d, ranks }: { detail: MemberSessionDetail; ranks: Ranked<MemberSessionDetail["standings"][number]>[] }) {
  const unit = d.format.leaderboardMode === "wins" ? "Menang" : "Poin";
  const row = ({ s, rank, tie, value }: (typeof ranks)[number]) => (
    <li key={s.id} className={cx(s.me && styles.finalMe)}>
      <b>
        {tie ? "=" : ""}
        {rank}
      </b>
      <span className={styles.finalName}>
        <span className={styles.miniFace}>{initials(s.name)}</span>
        {s.name}
        {s.me && " (kamu)"}
      </span>
      <small>
        {s.played}/{s.total}
      </small>
      <strong>{value}</strong>
    </li>
  );
  return (
    <section className={styles.finalBoard} aria-labelledby="final-title">
      <header>
        <h2 id="final-title">Peringkat final</h2>
        <small>Final · {formatTanggalPendek(endedAt(d), d.city, "time")}</small>
      </header>
      <p className={styles.finalCols} aria-hidden>
        <span>#</span>
        <span>Pemain</span>
        <span>Match</span>
        <span>{unit}</span>
      </p>
      <ol>{ranks.slice(0, TOP).map(row)}</ol>
      {ranks.length > TOP && (
        <details className={styles.finalMore}>
          <summary>
            Lihat peringkat lengkap ({ranks.length}) <ChevronDown size={14} aria-hidden />
          </summary>
          <ol>{ranks.slice(TOP).map(row)}</ol>
        </details>
      )}
      <p className={styles.finalNote}>Nilai seri berbagi peringkat (=). Hanya match yang diinput host yang dihitung.</p>
    </section>
  );
}

/** Hasil sesi · tampilan host (Figma Simplify HL-5b): peringkat final, Slay Point, Panel Host ditutup. */
export function HostResults({ detail: d, endedNotice }: { detail: MemberSessionDetail; endedNotice: number | null }) {
  const { present, earning, bonus, total } = sessionPoints(d, !!d.ended);
  const plan = planOf(d);
  const played = plan.rounds.filter((r) => !isUnstarted(plan.statusOf(r)) && d.matches.some((m) => m.round === r && m.scoreA !== null));
  const unplayed = plan.rounds.filter((r) => !played.includes(r));
  const by = d.ended ? (d.ended.byMe ? "Diakhiri oleh kamu (host)" : "Diakhiri host / admin") : "Selesai sesuai jadwal";

  return (
    <>
      {endedNotice !== null && (
        <p className={styles.endedToast} role="status">
          <Check size={16} aria-hidden /> Activity diakhiri. Hasil sudah tampil untuk {endedNotice} peserta.
        </p>
      )}
      <section className={styles.hostDone} aria-labelledby="host-done-title">
        <header className={styles.liveHead}>
          <span className={styles.eyebrowDark}>
            Sesi selesai · {by} · {formatTanggalPendek(endedAt(d), d.city, "time")}
          </span>
          <span className={styles.donePill}>Selesai</span>
        </header>
        <h2 id="host-done-title" className={styles.bannerTitle}>
          Activity selesai · skor terkunci
        </h2>
        <Podium detail={d} />
        <div className={styles.pointsCard}>
          <span>Slay Point yang dibagikan</span>
          <strong>{formatAngka(total)} pts</strong>
          <small>
            +{d.format.attendancePoints} × {earning} member hadir{present > earning ? ` (${present - earning} peserta tanpa akun tidak dapat poin)` : ""}
            {d.ended ? ` · bonus juara ${bonus ? `+${PODIUM_BONUS.join(" / +")}` : "–"}` : " · tanpa bonus juara (sesi tidak diakhiri lewat Akhiri Activity)"}
          </small>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="host-closed-title">
        <h2 id="host-closed-title" className={styles.cardTitle}>
          Panel Host <span className={styles.hostBadge}>Host</span>
        </h2>
        <p className={styles.muted}>
          Panel Host ditutup · {played.length} dari {plan.rounds.length} ronde dimainkan
          {unplayed.length > 0 && ` · ${roundList(unplayed)} tidak dimainkan`}. Hasil sudah tampil untuk peserta.
        </p>
        <p className={styles.small}>Skor terkunci. Koreksi hanya bisa dilakukan admin. Foto sesi diunggah tim Soslay maks. 1×24 jam.</p>
      </section>
    </>
  );
}

/** Tab Foto (Figma S3 · 2a/2b): menunggu unggahan (SLA 1×24 jam) atau cover + link album. */
export function PhotosTab({ detail: d }: { detail: MemberSessionDetail }) {
  const end = endedAt(d);
  const due = photoDue(d);
  if (d.photos) {
    return (
      <section className={styles.card} aria-labelledby="foto-title">
        <header className={styles.cardHead}>
          <div>
            <h2 id="foto-title" className={styles.cardTitle}>
              Foto sesi
            </h2>
            <p className={styles.muted}>
              {d.photos.count ? `${d.photos.count} foto · ` : ""}
              {d.photos.postedAt ? `diunggah ${formatTanggalPendek(d.photos.postedAt, d.city)}` : "Album Google Drive"}
            </p>
          </div>
          <span className={cx(styles.pill, styles.pillOk)}>Baru</span>
        </header>
        <a href={d.photos.albumUrl} target="_blank" rel="noopener noreferrer" className={styles.photoCover}>
          {d.photos.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL foto dari Storage admin, ukuran bebas.
            <img src={d.photos.coverUrl} alt={`Foto sesi ${d.title}`} />
          ) : (
            <span className={styles.photoEmpty}>
              <Camera size={28} aria-hidden />
            </span>
          )}
        </a>
        <a href={d.photos.albumUrl} target="_blank" rel="noopener noreferrer" className={styles.btnNavy}>
          Buka album Google Drive <ExternalLink size={16} aria-hidden />
        </a>
      </section>
    );
  }
  return (
    <section className={cx(styles.card, styles.locked)} aria-labelledby="foto-title">
      <span className={styles.photoIcon} aria-hidden>
        <Camera size={20} />
      </span>
      <h2 id="foto-title" className={styles.cardTitle}>
        Foto sedang diproses
      </h2>
      <p className={styles.muted}>Fotografer sedang memilih &amp; mengunggah foto sesi. Foto tersedia paling lambat 1×24 jam setelah sesi selesai.</p>
      <p className={styles.photoDue}>
        <small>Tersedia paling lambat</small>
        <strong>{formatTanggalPendek(due, d.city, "dateTime")}</strong>
      </p>
      <ol className={styles.photoSteps}>
        <li className={styles.photoStepDone}>
          Sesi selesai <small>{formatTanggalPendek(end, d.city, "dateTime")}</small>
        </li>
        <li className={styles.photoStepNow}>Fotografer mengunggah ke Google Drive</li>
        <li>Foto tersedia di sini</li>
      </ol>
    </section>
  );
}

/** Kolom samping tab Hasil / Foto / Review peserta: teaser foto, ajakan review, booking lagi. */
export function DoneSide({ detail: d, tab }: { detail: MemberSessionDetail; tab: string }) {
  const due = photoDue(d);
  // Lewat 7 hari tanpa review → tidak ada lagi yang bisa ditulis (tab Review terkunci).
  const reviewClosed = !d.myReview && d.fetchedAt > new Date(d.reviewUntil).getTime();
  return (
    <>
      {tab !== "foto" && !d.photos && (
        <Link href="?tab=foto" scroll={false} replace className={styles.photoTeaser}>
          <span>
            <strong>Foto sesi sedang diproses</strong>
            <small>Tersedia paling lambat {formatTanggalPendek(due, d.city, "dateTime")} di tab Foto</small>
          </span>
          Lihat →
        </Link>
      )}
      {tab !== "review" && d.ticket && !reviewClosed && (
        <section className={styles.card} aria-labelledby="review-cta-title">
          <h2 id="review-cta-title" className={styles.cardTitle}>
            Gimana sesinya?
          </h2>
          <p className={styles.muted}>{d.myReview ? "Terima kasih sudah memberi review!" : "Beri rating untuk host & venue. Review pertama dapat +10 Slay Point."}</p>
          {d.myReview && (
            <span className={styles.starsStatic} aria-label={`${d.myReview.rating} dari 5 bintang`}>
              {"★".repeat(d.myReview.rating)}
              <i>{"★".repeat(5 - d.myReview.rating)}</i>
            </span>
          )}
          <Link href="?tab=review" scroll={false} replace className={styles.btnNavy}>
            {d.myReview ? "Lihat review" : "Tulis review"}
          </Link>
        </section>
      )}
      <section className={styles.againCard} aria-labelledby="again-title">
        <h2 id="again-title">Main lagi minggu depan?</h2>
        <p>Cek jadwal sesi {d.typeLabel} berikutnya dan amankan slot kamu.</p>
        {d.registration?.kuyUrl ? (
          <a href={d.registration.kuyUrl} target="_blank" rel="noopener noreferrer" className={styles.btnNavy}>
            Booking Session di Kuyy
          </a>
        ) : (
          <Link href="/activity" className={styles.btnNavy}>
            Lihat jadwal sesi
          </Link>
        )}
      </section>
    </>
  );
}
