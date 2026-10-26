"use client";

import { BookOpen, Minus, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { teamName } from "@/lib/text";
import type { DetailMatch } from "@/server/member/session-detail";
import { submitHostScore } from "@/server/member/actions";
import styles from "./SessionDetail.module.css";

/**
 * Tombol "Input Skor" (khusus host) + modal: pilih court ronde ini, atur skor salah satu tim —
 * tim lawan otomatis = target − skor (total selalu = target, sama seperti di admin).
 */
export function HostScoreButton({ matches, target }: { matches: DetailMatch[]; target: number }) {
  const router = useRouter();
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  const first = matches.find((m) => m.scoreA === null) ?? matches[0];
  const [matchId, setMatchId] = useState(first?.id ?? null);
  const match = matches.find((m) => m.id === matchId) ?? first;
  const [scoreA, setScoreA] = useState(match?.scoreA ?? Math.ceil(target / 2));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  if (!match) return null;
  const scoreB = target - scoreA;
  const pick = (m: DetailMatch) => {
    setMatchId(m.id);
    setScoreA(m.scoreA ?? Math.ceil(target / 2));
    setError(null);
  };
  const save = () =>
    startSaving(async () => {
      const result = await submitHostScore(match.id!, scoreA, scoreB);
      if (!result.ok) return setError(result.error);
      close();
      router.refresh();
    });

  return (
    <>
      <button type="button" className={styles.btnNavy} onClick={open}>
        <Pencil size={16} aria-hidden />
        Input Skor
      </button>
      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="score-title" onClick={onBackdropClick}>
        <div className={styles.qrPanel}>
          <header className={styles.qrHead}>
            <h2 id="score-title">Input skor · Ronde {match.round}</h2>
            <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
              <X size={18} />
            </button>
          </header>
          {matches.length > 1 && (
            <div className={styles.courtPicker} role="radiogroup" aria-label="Pilih court">
              {matches.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={m.id === match.id} className={cx(styles.courtChip, m.id === match.id && styles.courtChipOn)} onClick={() => pick(m)}>
                  Court {m.court}
                  {m.scoreA !== null && " ✓"}
                </button>
              ))}
            </div>
          )}
          {[
            { team: match.a, value: scoreA, set: (v: number) => setScoreA(v) },
            { team: match.b, value: scoreB, set: (v: number) => setScoreA(target - v) },
          ].map(({ team, value, set }) => (
            <div key={team.join()} className={styles.stepRow}>
              <span className={styles.stepTeam}>{teamName(team)}</span>
              <span className={styles.stepper}>
                <button type="button" aria-label="Kurangi" disabled={value <= 0} onClick={() => set(value - 1)}>
                  <Minus size={16} />
                </button>
                <strong>{value}</strong>
                <button type="button" aria-label="Tambah" disabled={value >= target} onClick={() => set(value + 1)}>
                  <Plus size={16} />
                </button>
              </span>
            </div>
          ))}
          <p className={styles.small}>
            Total {target} poin — skor lawan terisi otomatis. Skor langsung masuk leaderboard{match.scoreA !== null ? " (menimpa skor sebelumnya)" : ""}.
          </p>
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}
          <div className={styles.qrActions}>
            <button type="button" className={styles.btnOutline} onClick={close}>
              Batal
            </button>
            <button type="button" className={styles.btnNavy} onClick={save} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan skor"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** "Aturan skor" — ringkasan cara main & penilaian (Figma UIF-07). */
export function ScoreRulesButton({ target, mode }: { target: number; mode: "points" | "wins" }) {
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  return (
    <>
      <button type="button" className={styles.btnOutline} onClick={open}>
        <BookOpen size={16} aria-hidden />
        Aturan skor
      </button>
      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="rules-title" onClick={onBackdropClick}>
        <div className={styles.qrPanel}>
          <header className={styles.qrHead}>
            <h2 id="rules-title">Aturan skor</h2>
            <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
              <X size={18} />
            </button>
          </header>
          <ul className={styles.rules}>
            <li>Tiap match dimainkan sampai total poin kedua tim = {target} (mis. 12–9). Tidak ada batas waktu.</li>
            <li>Partner berganti setiap ronde; court & pasangan mengikuti line-up dari host.</li>
            <li>Skor diinput & diverifikasi oleh host sesi — lapor skor ke host setelah match selesai.</li>
            <li>{mode === "wins" ? "Peringkat diurutkan dari jumlah menang, lalu total poin." : "Poin individu = skor tim kamu di setiap match yang kamu mainkan; peringkat diurutkan dari total poin."}</li>
            <li>Poin seri berbagi peringkat (=).</li>
          </ul>
          <button type="button" className={styles.btnNavy} onClick={close}>
            Mengerti
          </button>
        </div>
      </dialog>
    </>
  );
}
