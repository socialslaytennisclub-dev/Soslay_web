"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import type { DetailPerson } from "@/server/member/session-detail";
import { setHostCheckIn } from "@/server/member/actions";
import styles from "./SessionDetail.module.css";

/** Alasan check-in manual (Figma S1-H · 2b) — sekadar konfirmasi host, tidak disimpan. */
const MANUAL_REASONS = ["QR rusak / HP mati", "Tidak bawa HP", "Lainnya"];

const PAGE = 8;

/**
 * Tab Peserta (Figma 2a): cari nama, daftar peserta + level & sumber daftar, "Lihat N lainnya".
 * Host (`checkIn`) menandai kehadiran langsung dari daftar (Figma S1-H · check-in manual).
 */
export function ParticipantList({ people, checkIn = false, sessionId }: { people: DetailPerson[]; checkIn?: boolean; sessionId?: string }) {
  const router = useRouter();
  const { dialogRef: confirmRef, open: openConfirm, close: closeConfirm, onBackdropClick: onConfirmBackdrop } = useDialog();
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [target, setTarget] = useState<DetailPerson | null>(null);
  const [reason, setReason] = useState(MANUAL_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const mark = (p: DetailPerson, value: boolean) =>
    startBusy(async () => {
      if (!sessionId) return;
      const result = await setHostCheckIn(sessionId, p.id, value);
      if (!result.ok) return setError(result.error);
      setError(null);
      closeConfirm();
      router.refresh();
    });
  const ask = (p: DetailPerson) => {
    setTarget(p);
    setReason(MANUAL_REASONS[0]);
    setError(null);
    openConfirm();
  };
  const q = query.trim().toLowerCase();
  const found = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  const shown = all || q ? found : found.slice(0, PAGE);

  return (
    <>
      <label className={styles.search}>
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama peserta…" aria-label="Cari nama peserta" />
      </label>
      <ul className={styles.people}>
        {shown.map((p, i) => (
          <li key={p.id} className={styles.person}>
            <span className={cx(styles.personAvatar, styles[`face${i % 4}`])} aria-hidden>
              {initials(p.name)}
            </span>
            <span className={styles.personText}>
              <strong>
                {p.name}
                {p.me && <small> (kamu)</small>}
              </strong>
              <small>
                {p.level} · via {p.source}
              </small>
            </span>
            {checkIn ? (
              p.checkedIn ? (
                <button type="button" className={cx(styles.pill, styles.pillOk)} onClick={() => mark(p, false)} disabled={busy} title="Batalkan check-in">
                  <Check size={12} aria-hidden /> Hadir
                </button>
              ) : (
                <button type="button" className={styles.btnOutlineSm} onClick={() => ask(p)} disabled={busy}>
                  Check-in
                </button>
              )
            ) : (
              <span className={cx(styles.pill, p.checkedIn && styles.pillOk)}>{p.checkedIn ? "Hadir" : "Terdaftar"}</span>
            )}
          </li>
        ))}
        {found.length === 0 && <li className={styles.muted}>Tidak ada peserta dengan nama itu.</li>}
      </ul>
      {!all && !q && found.length > PAGE && (
        <button type="button" className={styles.link} onClick={() => setAll(true)}>
          Lihat {found.length - PAGE} peserta lainnya
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
      {error && !target && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      {checkIn && (
        <dialog ref={confirmRef} className={styles.qrDialog} aria-labelledby="checkin-title" onClick={onConfirmBackdrop}>
          {target && (
            <div className={styles.qrPanel}>
              <header className={styles.qrHead}>
                <div>
                  <h2 id="checkin-title">Check-in manual</h2>
                  <span className={styles.muted}>
                    {target.name} · {target.level}
                  </span>
                </div>
                <button type="button" className={styles.qrClose} onClick={closeConfirm} aria-label="Tutup">
                  <X size={18} />
                </button>
              </header>
              <fieldset className={styles.reasonSet}>
                <legend className={styles.endLabel}>Alasan check-in tanpa QR</legend>
                {MANUAL_REASONS.map((r) => (
                  <button key={r} type="button" aria-pressed={reason === r} className={cx(styles.reasonChip, reason === r && styles.reasonChipOn)} onClick={() => setReason(r)}>
                    {r}
                  </button>
                ))}
              </fieldset>
              <p className={styles.small}>Pastikan peserta sudah ada di lapangan. Peserta yang hadir masuk acakan line-up; yang punya akun Soslay juga mendapat Slay Point.</p>
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.qrActions}>
                <button type="button" className={styles.btnOutline} onClick={closeConfirm}>
                  Batal
                </button>
                <button type="button" className={styles.btnLime} onClick={() => mark(target, true)} disabled={busy}>
                  {busy ? "Menyimpan…" : "Tandai hadir"}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}
    </>
  );
}
