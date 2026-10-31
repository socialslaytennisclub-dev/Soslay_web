"use client";

import { Lock, Play, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { formatTanggalPendek } from "@/lib/format";
import type { MemberSessionDetail } from "@/server/member/session-detail";
import { saveHostLineup, startHostActivity } from "@/server/member/actions";
import { Countdown } from "./Countdown";
import { shuffleFromRound } from "./HostLineup";
import styles from "./SessionDetail.module.css";

/**
 * Tab Live host sebelum sesi mulai (Figma Simplify S1-H · 2–4): hitung mundur + "Mulai Activity".
 * Popup memilih line-up Ronde 1 — prioritaskan yang sudah hadir (diacak ulang dari Ronde 1) atau
 * line-up awal dari admin. Tanpa ditekan, sesi tetap live otomatis di jam jadwal.
 */
export function HostStartCard({ detail: d }: { detail: MemberSessionDetail }) {
  // Tombol aktif sendiri saat check-in dibuka (halaman yang dibiarkan terbuka tidak perlu dimuat ulang).
  const checkInAt = new Date(d.checkInAt).getTime();
  const [canStart, setCanStart] = useState(d.fetchedAt >= checkInAt);
  useEffect(() => {
    if (canStart) return;
    const timer = setTimeout(() => setCanStart(true), Math.max(0, checkInAt - Date.now()));
    return () => clearTimeout(timer);
  }, [canStart, checkInAt]);
  const router = useRouter();
  const { dialogRef, open: openDialog, close, onBackdropClick } = useDialog();
  const [mode, setMode] = useState<"present" | "original">("present");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, startBusy] = useTransition();
  const present = d.people.filter((p) => p.checkedIn).length;
  const [minutesEarly, setMinutesEarly] = useState(0);
  const openStart = () => {
    setMinutesEarly(Math.max(0, Math.round((new Date(d.startsAt).getTime() - Date.now()) / 60_000)));
    setError(null);
    openDialog();
  };

  const start = () =>
    startBusy(async () => {
      const lineup = mode === "present" && d.matches.length ? shuffleFromRound(d, 1) : null;
      if (mode === "present" && d.matches.length && !lineup) {
        return setError("Minimal 4 peserta harus sudah check-in untuk mengacak line-up. Pilih line-up awal atau check-in peserta dulu.");
      }
      // Mulai dulu — line-up admin baru diganti setelah sesi benar-benar live (gagal mulai → line-up utuh).
      const result = await startHostActivity(d.id);
      if (!result.ok) return setError(result.error);
      if (lineup) {
        const saved = await saveHostLineup(d.id, 1, lineup);
        if (!saved.ok) {
          // Sesi sudah live: refresh menunggu popup ditutup, agar pesan ini sempat terbaca.
          setStarted(true);
          return setError(`Activity sudah dimulai dengan line-up awal, tapi acak ulang gagal: ${saved.error} Coba "Atur line-up" di Panel Host.`);
        }
      }
      close();
      router.refresh();
    });

  return (
    <section className={cx(styles.card, styles.locked)} aria-labelledby="host-start-title">
      <span className={styles.lockIcon} aria-hidden>
        <Lock size={18} />
      </span>
      <span className={styles.pillWarn}>Kamu host sesi ini</span>
      <h2 id="host-start-title" className={styles.cardTitle}>
        Live dimulai {formatTanggalPendek(d.startsAt, d.city, "dateTime")}
      </h2>
      <p className={styles.muted}>
        Check-in peserta dari tab Peserta, lalu tekan &quot;Mulai Activity&quot;. Tanpa ditekan, sesi otomatis live di jam jadwal dan Ronde 1 bisa langsung diinput skornya.
      </p>
      <Countdown target={d.startsAt} size="sm" />
      <p className={styles.small}>
        {present}/{d.people.length} peserta sudah check-in
      </p>
      <div className={styles.startActions}>
        <button type="button" className={styles.btnLime} onClick={openStart} disabled={!canStart}>
          <Play size={14} aria-hidden fill="currentColor" />
          Mulai Activity
        </button>
        {!canStart && <span className={styles.small}>Bisa dimulai sejak check-in dibuka ({formatTanggalPendek(d.checkInAt, d.city, "time")}).</span>}
        <Link href="?tab=peserta" scroll={false} replace className={styles.link}>
          Check-in peserta →
        </Link>
      </div>

      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="start-title" onClick={onBackdropClick} onClose={() => started && router.refresh()}>
        <div className={styles.qrPanel}>
          <header className={styles.qrHead}>
            <div>
              <h2 id="start-title">Mulai activity sekarang?</h2>
              <span className={styles.muted}>
                Jadwal {formatTanggalPendek(d.startsAt, d.city, "time")} · {minutesEarly > 0 ? `${minutesEarly} menit lebih awal` : "sesuai jadwal"}
              </span>
            </div>
            <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
              <X size={18} />
            </button>
          </header>
          <div className={styles.startStats}>
            <span className={styles.startStatOk}>
              <small>Sudah check-in</small>
              <strong>{present}</strong>
            </span>
            <span className={styles.startStatWarn}>
              <small>Belum hadir</small>
              <strong>{d.people.length - present}</strong>
            </span>
          </div>
          {d.matches.length > 0 && (
            <fieldset className={styles.startModes}>
              <legend className={styles.endLabel}>Line-up ronde 1</legend>
              {(
                [
                  ["present", "Prioritaskan yang sudah hadir", "Semua ronde diacak ulang hanya dengan peserta yang sudah check-in. Yang datang belakangan masuk saat line-up diacak lagi."],
                  ["original", "Pakai line-up awal", "Line-up dari admin tetap dipakai; pemain yang belum hadir tetap terjadwal."],
                ] as const
              ).map(([value, title, text]) => (
                <label key={value} className={cx(styles.startMode, mode === value && styles.startModeOn)}>
                  <input type="radio" name="lineup-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className={styles.small}>Tab Live, Leaderboard &amp; Ronde langsung terbuka untuk semua peserta.</p>
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}
          <div className={styles.qrActions}>
            {started ? (
              <button type="button" className={styles.btnLime} onClick={close}>
                Tutup
              </button>
            ) : (
              <>
                <button type="button" className={styles.btnOutline} onClick={close}>
                  Batal
                </button>
                <button type="button" className={styles.btnLime} onClick={start} disabled={busy}>
                  {busy ? "Memulai…" : "Mulai Activity"}
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}
