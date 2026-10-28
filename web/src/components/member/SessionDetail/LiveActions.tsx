"use client";

import { BookOpen, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { teamName } from "@/lib/text";
import type { DetailMatch } from "@/server/member/session-detail";
import { clearHostScore, submitHostScore } from "@/server/member/actions";
import styles from "./SessionDetail.module.css";

type Saved = { matchId: string; court: number; label: string; previous: { a: number; b: number } | null };

/**
 * Panel Host (Figma UIF-09): status tiap court di satu ronde, "Input skor" / "Ubah skor" lewat
 * modal, lalu notifikasi tersimpan + Urungkan. Skor host langsung terverifikasi (masuk
 * leaderboard); hak host & total = target dicek ulang di database.
 */
export function HostPanel({ matches, currentRound, maxRound, target, canScore, isPlayer }: { matches: DetailMatch[]; currentRound: number; maxRound: number; target: number; canScore: boolean; isPlayer: boolean }) {
  const router = useRouter();
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const [round, setRound] = useState(currentRound);
  const [editing, setEditing] = useState<DetailMatch | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const courts = matches.filter((m) => m.round === round);
  const scoreB = target - scoreA;

  const edit = (m: DetailMatch) => {
    setEditing(m);
    setScoreA(m.scoreA ?? Math.ceil(target / 2));
    setError(null);
    open();
  };

  const save = () =>
    startBusy(async () => {
      if (!editing?.id) return;
      const result = await submitHostScore(editing.id, scoreA, scoreB);
      if (!result.ok) return setError(result.error);
      setSaved({
        matchId: editing.id,
        court: editing.court,
        label: `${teamName(editing.a)} ${scoreA}–${scoreB}`,
        previous: editing.scoreA === null || editing.scoreB === null ? null : { a: editing.scoreA, b: editing.scoreB },
      });
      close();
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

  return (
    <section className={styles.hostPanel} aria-labelledby="host-panel-title">
      <header className={styles.hostHead}>
        <div>
          <h2 id="host-panel-title" className={styles.cardTitle}>
            Panel Host <span className={styles.hostBadge}>Host</span>
          </h2>
          <p className={styles.muted}>
            {isPlayer ? "Kamu host sesi ini dan juga bermain" : "Kamu host sesi ini"} · Ronde {currentRound} dari {maxRound}
          </p>
        </div>
        {rounds.length > 1 && (
          <label className={styles.roundSelect}>
            <span className="visually-hidden">Pilih ronde</span>
            <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
              {rounds.map((r) => (
                <option key={r} value={r}>
                  Ronde {r}
                  {r === currentRound ? " · sekarang" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {saved && (
        <p className={styles.hostSaved} role="status">
          <span>
            Skor Court {saved.court} tersimpan &amp; terverifikasi · {saved.label}. Leaderboard sudah diperbarui.
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
                <button type="button" className={scored ? styles.btnOutline : styles.btnNavy} onClick={() => edit(m)}>
                  {scored ? "Ubah skor" : "Input skor"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.small}>{canScore ? "Skor yang diinput host langsung masuk leaderboard. Aturan skor tetap diatur admin." : "Sesi sudah diakhiri — skor terkunci. Hubungi admin untuk koreksi."}</p>

      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="score-title" onClick={onBackdropClick}>
        {editing && (
          <div className={styles.qrPanel}>
            <header className={styles.qrHead}>
              <div>
                <h2 id="score-title">Input Skor · Court {editing.court}</h2>
                <span className={styles.scoreChip}>Ronde {editing.round} · diinput host</span>
              </div>
              <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
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
                <strong>Skor dari host langsung terverifikasi</strong>
                Skor ini langsung masuk leaderboard tanpa menunggu konfirmasi lawan. Pastikan sesuai hasil di lapangan.
              </span>
            </div>
            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.qrActions}>
              <button type="button" className={styles.btnOutline} onClick={close}>
                Batal
              </button>
              <button type="button" className={styles.btnNavy} onClick={save} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan & verifikasi"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
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
