"use client";

import { BookOpen, Check, ChevronDown, Minus, Play, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useDialog } from "@/hooks/useDialog";
import { useDisclosure } from "@/hooks/useDisclosure";
import { cx } from "@/lib/cx";
import { isUnstarted, planRounds, ROUND_STATUS_LABEL, roundList, skippedLabel, type RoundPlan } from "@/lib/rounds";
import { firstName, teamName } from "@/lib/text";
import type { DetailMatch, MemberSessionDetail } from "@/server/member/session-detail";
import { clearHostScore, startHostRound, submitHostScore } from "@/server/member/actions";
import styles from "./SessionDetail.module.css";

type Saved = { matchId: string; court: number; label: string; previous: { a: number; b: number } | null };

/**
 * Panel Host (Figma UIF-09 + UIF-13): status tiap court di satu ronde, "Input skor" / "Ubah skor"
 * lewat modal, lalu notifikasi tersimpan + Urungkan. Header punya pemilih ronde: pilih ronde yang
 * belum dimulai lalu "Mulai Ronde" (boleh melompat; ronde yang terlewat jadi Dilewati), atau buka
 * ronde yang sudah berjalan untuk melihat / mengubah skornya. Skor host langsung terverifikasi;
 * hak host & total = target dicek ulang di database.
 */
export function HostPanel({ detail: d, maxRound, isPlayer }: { detail: MemberSessionDetail; maxRound: number; isPlayer: boolean }) {
  const { matches, currentRound, canScore } = d;
  const target = d.format.targetPoints;
  const router = useRouter();
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  const plan = planRounds(matches, currentRound, d.startedRounds, d.phase);
  // Pilihan manual berlaku selama ronde live belum berganti; setelah itu kembali ke default.
  const [picked, setPicked] = useState<{ round: number; at: number | null } | null>(null);
  const [editing, setEditing] = useState<DetailMatch | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  // Ronde hanya bisa dimulai saat sesi berjalan (database juga menolak di luar jadwal).
  const canStart = canScore && d.phase === "live";
  // Default pilihan = ronde terkecil yang belum dimulai; tanpa sisa ronde → ronde yang sedang live.
  const selected = (picked?.at === currentRound ? picked.round : null) ?? (canStart ? plan.next : null) ?? currentRound ?? plan.rounds[0];
  const selectedStatus = plan.statusOf(selected);
  const notStarted = isUnstarted(selectedStatus);
  // Court yang tampil: ronde terpilih bila sudah berjalan, selain itu ronde live.
  const round = notStarted ? (currentRound ?? selected) : selected;
  const skipped = skippedLabel(plan.skipped);
  const present = new Set(d.people.filter((p) => p.checkedIn).map((p) => p.id));
  const nameOf = new Map(d.people.map((p) => [p.id, p.name]));

  const roundNote = (r: number) => {
    const list = matches.filter((m) => m.round === r);
    const status = plan.statusOf(r);
    if (status === "done") return null;
    if (status === "live" || status === "partial") {
      const unscored = list.filter((m) => m.scoreA === null).map((m) => m.court);
      return `Court ${unscored.join(" & ")} belum selesai`;
    }
    const players = [...new Set(list.flatMap((m) => m.playerIds))];
    const missing = players.filter((id) => !present.has(id));
    if (!missing.length) return `${players.length}/${players.length} pemain sudah hadir`;
    const names = missing.slice(0, 3).map((id) => firstName(nameOf.get(id) ?? "Pemain")).join(", ");
    return `${players.length - missing.length}/${players.length} hadir · belum: ${names}${missing.length > 3 ? ` +${missing.length - 3}` : ""}`;
  };

  const start = () =>
    startBusy(async () => {
      const result = await startHostRound(d.id, selected);
      if (!result.ok) return setError(result.error);
      setError(null);
      setPicked(null);
      router.refresh();
    });

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
            {skipped && ` · ${skipped}`}
          </p>
        </div>
        {plan.rounds.length > 1 && (
          <div className={styles.hostActions}>
            <RoundPicker plan={plan} selected={selected} note={roundNote} onPick={(r) => setPicked({ round: r, at: currentRound })} hint={canStart ? "Default: ronde terkecil yang belum dimulai" : null} />
            {canStart && notStarted && (
              <button type="button" className={styles.btnStart} onClick={start} disabled={busy}>
                <Play size={14} aria-hidden fill="currentColor" />
                {busy ? "Memulai…" : "Mulai Ronde"}
              </button>
            )}
            {selectedStatus === "live" && <span className={styles.livePillRed}>Live</span>}
          </div>
        )}
      </header>

      {plan.skipped.length > 0 && d.phase === "live" && (
        <p className={styles.skipBanner}>
          <strong>
            {skipped} · belum dimainkan
          </strong>
          Jadi ronde berikutnya otomatis (nomor terkecil yang belum dimulai). Line-up {roundList(plan.skipped)} tetap.
        </p>
      )}

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

      {round !== selected && (
        <p className={styles.small}>
          Court di bawah: <strong>Ronde {round}</strong>
          {plan.statusOf(round) === "live" && " (sedang live)"}. Ronde {selected} belum dimulai{canStart && " — tekan Mulai Ronde untuk memulainya"}.
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

/** Dropdown "Pilih ronde" (Figma UIF-13 · A8b): status tiap ronde + jumlah pemain yang sudah hadir. */
function RoundPicker({ plan, selected, note, onPick, hint }: { plan: RoundPlan; selected: number; note: (r: number) => string | null; onPick: (r: number) => void; hint: string | null }) {
  const { isOpen: open, close, toggle } = useDisclosure();
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("[data-round]") ?? [])];
  useClickOutside(ref, close, open);

  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    // Menu rata kanan tombol; bila keluar layar di kiri (aksi turun ke baris bawah di HP), rata kiri.
    if (menu.current.getBoundingClientRect().left < 0) menu.current.classList.add(styles.roundMenuStart);
    // Fokus pindah ke ronde terpilih saat menu terbuka.
    items().find((b) => b.getAttribute("aria-current") === "true")?.focus();
  }, [open]);

  // Keyboard: ↑/↓/Home/End pindah ronde, Escape tutup & kembali ke tombol.
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      trigger.current?.focus();
    } else if (to !== null) {
      e.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, to))]?.focus();
    }
  };

  return (
    <div ref={ref} className={styles.roundPicker}>
      <button ref={trigger} type="button" className={styles.roundPickerBtn} aria-expanded={open} aria-controls={menuId} onClick={toggle}>
        Ronde {selected}
        <ChevronDown size={14} aria-hidden className={cx(open && styles.caretUp)} />
      </button>
      {open && (
        <div ref={menu} id={menuId} className={styles.roundMenu} onKeyDown={onMenuKey}>
          <p className={styles.roundMenuLabel}>Pilih ronde</p>
          <ul aria-label="Pilih ronde">
            {plan.rounds.map((r) => {
              const status = plan.statusOf(r);
              const detail = note(r);
              const on = r === selected;
              return (
                <li key={r}>
                  <button
                    type="button"
                    data-round={r}
                    aria-current={on ? "true" : undefined}
                    className={cx(styles.roundItem, on && styles.roundItemOn, !isUnstarted(status) && styles.roundItemPast)}
                    onClick={() => {
                      onPick(r);
                      close();
                      trigger.current?.focus();
                    }}
                  >
                    <span>
                      <span className={styles.roundItemRow}>
                        Ronde {r}
                        {status !== "later" && <span className={cx(styles.roundPill, styles[`roundPill_${status}`])}>{ROUND_STATUS_LABEL[status]}</span>}
                      </span>
                      {detail && <small>{detail}</small>}
                    </span>
                    {on && <Check size={14} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {hint && <p className={styles.roundMenuHint}>{hint}</p>}
        </div>
      )}
    </div>
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
