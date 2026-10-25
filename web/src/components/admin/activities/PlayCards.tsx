"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateLineup, lineupStats, playableCourts, type LevelWeights, type LineupMatch } from "@/lib/americano";
import { cx } from "@/lib/cx";
import { saveLineup, saveMatchScore } from "@/server/admin/actions/play";
import type { MatchFormat, SessionMatch, SessionParticipant, TennisLevel } from "@/server/admin/types";
import { FormCard, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, MemberAvatar } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import editor from "./SessionEditor.module.css";
import styles from "./Play.module.css";

export type PlayForm = { matchFormat: MatchFormat; courtCount: string; roundCount: string; targetPoints: string; leaderboardMode: "points" | "wins"; showLeaderboard: boolean };

const RANKINGS = [
  { value: "wins", label: "Win" },
  { value: "points", label: "Point" },
] as const;

/** v1: Tanpa skor, Americano & Rotating Partner; skor hanya oleh host. */
const FORMATS: { value: MatchFormat; label: string; ready: boolean; hint?: string }[] = [
  { value: "none", label: "Tanpa skor", ready: true },
  { value: "round_robin", label: "Round robin", ready: false },
  { value: "americano", label: "Americano", ready: true, hint: "Partner berganti tiap ronde; tiap pemain main sama banyak & tidak berpasangan dengan orang yang sama dua kali." },
  { value: "rotating", label: "Rotating Partner", ready: true, hint: "Seperti Americano, tapi tim di tiap court diseimbangkan berdasarkan level tenis — cocok untuk mabar campur level." },
  { value: "knockout", label: "Knockout", ready: false },
];

/** Bobot level untuk menyeimbangkan tim Rotating Partner (level kosong = tengah). */
const LEVEL_WEIGHT: Record<TennisLevel, number> = { beginner: 1, beginner_intermediate: 2, intermediate: 3, intermediate_advanced: 4, advanced: 5 };

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);

/** Admin / Edit sesi — Format & skor (Figma ADM-10). */
export function FormatCard({ value, onChange, locked }: { value: PlayForm; onChange: (next: PlayForm) => void; locked: boolean }) {
  const hint = FORMATS.find((f) => f.value === value.matchFormat)?.hint;
  const set = (patch: Partial<PlayForm>) => onChange({ ...value, ...patch });
  const scored = value.matchFormat !== "none";

  return (
    <FormCard title="Format & skor" subtitle="Atur format pertandingan dan siapa yang mengisi skor" action={<Badge tone="lime">Baru</Badge>}>
      <fieldset className={editor.fieldset}>
        <legend className={editor.label}>Format pertandingan *</legend>
        <div className={editor.segmentWrap}>
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={value.matchFormat === f.value}
              disabled={!f.ready || locked}
              title={!f.ready ? "Segera hadir" : locked ? "Format terkunci setelah ada skor" : undefined}
              className={cx(editor.option, value.matchFormat === f.value && editor.optionOn, !f.ready && styles.optionDisabled)}
              onClick={() => set({ matchFormat: f.value })}
            >
              {f.label}
              {!f.ready && <span className={styles.soon}>Segera</span>}
            </button>
          ))}
        </div>
        {hint && <span className={editor.muted}>{hint}</span>}
      </fieldset>

      {scored && (
        <>
          <fieldset className={editor.fieldset}>
            <legend className={editor.label}>Format leaderboard *</legend>
            <div className={editor.segmentWrap}>
              {RANKINGS.map((r) => (
                <button key={r.value} type="button" aria-pressed={value.leaderboardMode === r.value} className={cx(editor.option, value.leaderboardMode === r.value && editor.optionOn)} onClick={() => set({ leaderboardMode: r.value })}>
                  {r.label}
                </button>
              ))}
            </div>
            <span className={editor.muted}>Win: peringkat dari jumlah menang · Point: dari total poin</span>
          </fieldset>

          <div className={editor.cols3}>
            <NumberField label="Jumlah court" suffix="court" value={value.courtCount} onChange={(v) => set({ courtCount: v })} disabled={locked} />
            <NumberField label="Jumlah ronde" suffix="ronde" value={value.roundCount} onChange={(v) => set({ roundCount: v })} />
            <NumberField label="Target poin" suffix="/ match" value={value.targetPoints} onChange={(v) => set({ targetPoints: v })} disabled={locked} />
          </div>

          <hr className={styles.divider} />

          <fieldset className={editor.fieldset}>
            <legend className={editor.label}>Pengisian skor *</legend>
            <span className={editor.muted}>Menentukan tampilan halaman Live peserta (web & mobile).</span>
            <div className={styles.radioCards}>
              <button type="button" className={cx(styles.radioCard, styles.radioCardOn)} aria-pressed="true">
                <span className={styles.radioDot} />
                <span>
                  <span className={styles.radioTitle}>Hanya host</span>
                  <span className={styles.radioText}>Host/admin input skor tiap court dan langsung masuk leaderboard. Peserta hanya melihat skor live.</span>
                </span>
              </button>
              <button type="button" className={cx(styles.radioCard, styles.radioCardOff)} disabled title="Segera hadir">
                <span className={styles.radioDot} />
                <span>
                  <span className={styles.radioTitle}>
                    Peserta input skor <span className={styles.soon}>Segera</span>
                  </span>
                  <span className={styles.radioText}>Peserta kirim skor dari halaman Live, lalu diverifikasi host.</span>
                </span>
              </button>
            </div>
          </fieldset>

          <Toggle label="Tampilkan Live Leaderboard ke peserta" hint="Leaderboard & skor court tampil di halaman Live peserta." checked={value.showLeaderboard} onChange={(v) => set({ showLeaderboard: v })} />

          <p className={styles.info}>
            <AdminIcon name="question" size={16} />
            <span>
              Bisa diubah saat event berlangsung lewat Activity Desk. Perubahan berlaku mulai ronde berikutnya.
              <br />
              Ronde tanpa batas waktu — match selesai saat total poin kedua tim = {value.targetPoints || "target"} (mis. 12–9).
            </span>
          </p>

          <span className={styles.deskRow}>
            <AdminButton size="sm" icon="monitor" disabled title="Activity Desk — segera hadir">
              Buka Activity Desk
            </AdminButton>
            <span className={editor.muted}>Tersedia saat sesi berstatus Live</span>
          </span>
        </>
      )}
    </FormCard>
  );
}

function NumberField({ label, suffix, value, onChange, disabled }: { label: string; suffix: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={editor.field}>
      <span className={editor.label}>{label}</span>
      <span className={editor.affix}>
        <input inputMode="numeric" value={value} disabled={disabled} onChange={(e) => onChange(digits(e.target.value))} />
        <span className={editor.muted}>{suffix}</span>
      </span>
    </label>
  );
}

// ── Match list & line-up ────────────────────────────────────────────────────

/** Nama pendek di chip: nama depan; kalau ada yang sama, tambah inisial nama belakang. */
function shortNames(players: SessionParticipant[]) {
  const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;
  const count = new Map<string, number>();
  for (const p of players) count.set(first(p.name).toLowerCase(), (count.get(first(p.name).toLowerCase()) ?? 0) + 1);
  return new Map(
    players.map((p) => {
      const parts = p.name.trim().split(/\s+/);
      const dup = (count.get(first(p.name).toLowerCase()) ?? 0) > 1 && parts.length > 1;
      return [p.id, dup ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]];
    }),
  );
}

/** Admin / Edit sesi — Match list & line-up (Figma ADM-12). Ganti / tukar pemain lewat dropdown di tiap slot court. */
export function LineupCard({
  sessionId,
  participants,
  courts,
  rounds,
  targetPoints,
  balanceLevels,
  initial,
  disabledReason,
}: {
  sessionId: string;
  participants: SessionParticipant[];
  courts: number;
  rounds: number;
  targetPoints: number;
  /** Rotating Partner: tim di tiap court diseimbangkan per level. */
  balanceLevels: boolean;
  initial: SessionMatch[];
  /** Diisi → kartu hanya informasi (mis. sesi belum disimpan). */
  disabledReason?: string;
}) {
  const players = useMemo(() => participants.filter((p) => p.status !== "waitlisted"), [participants]);
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const names = useMemo(() => shortNames(players), [players]);
  const levels = useMemo<LevelWeights | undefined>(
    () => (balanceLevels ? Object.fromEntries(players.map((p) => [p.id, p.level ? LEVEL_WEIGHT[p.level] : 3])) : undefined),
    [balanceLevels, players],
  );
  const router = useRouter();
  const [scoring, setScoring] = useState<string | null>(null);
  const [matches, setMatches] = useState<SessionMatch[]>(initial);
  const [round, setRound] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();

  const playable = playableCourts(players.length, courts);
  const isLocked = (m: SessionMatch) => m.scoreA !== null;
  const lockedRounds = new Set(matches.filter(isLocked).map((m) => m.round));
  const stats = lineupStats(matches, ids, levels);
  const outOfFormat = matches.some((m) => m.round > rounds || m.court > courts);
  const unknown = matches.some((m) => [...m.a, ...m.b].some((p) => !names.has(p)));

  const generate = () => {
    // Ronde yang sudah ada skornya dipertahankan; acak mulai ronde pertama yang belum berskor.
    const fromRound = lockedRounds.size ? Math.max(...lockedRounds) + 1 : 1;
    const keep = matches.filter((m) => m.round < fromRound);
    if (matches.length && !window.confirm(fromRound > 1 ? `Acak ulang Ronde ${fromRound}–${rounds}? Ronde yang sudah berskor tidak berubah.` : "Ganti line-up yang ada dengan acakan baru?")) return;
    const plan = generateLineup({ players: ids, courts, rounds }, { fromRound, history: keep as LineupMatch[], levels });
    setMatches([...keep, ...plan.map((m) => ({ ...m, scoreA: null, scoreB: null }))]);
    setRound(fromRound > rounds ? 1 : fromRound);
    setDirty(true);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveLineup(
        sessionId,
        matches.map(({ round, court, a, b }) => ({ round, court, a, b })),
      );
      toast.result(result);
      if (result.ok) {
        setDirty(false);
        router.refresh(); // ambil id match dari database → input skor aktif
      }
    });

  const saveScore = (m: SessionMatch, a: number, b: number) =>
    startSaving(async () => {
      const result = await saveMatchScore(sessionId, m.id!, a, b);
      toast.result(result);
      if (result.ok) {
        setMatches((list) => list.map((x) => (x.id === m.id ? { ...x, scoreA: a, scoreB: b } : x)));
        setScoring(null);
      }
    });

  const roundMatches = matches.filter((m) => m.round === round).sort((x, y) => x.court - y.court);
  const playing = new Set(roundMatches.flatMap((m) => [...m.a, ...m.b]));
  const resting = players.filter((p) => !playing.has(p.id));

  /** Ganti pemain di satu slot court lewat dropdown (Figma ADM-12): pemain terpilih bertukar tempat (pemain rest juga bisa). */
  const replaceSlot = (round: number, current: string, next: string) => {
    if (current === next) return;
    const swap = (p: string) => (p === current ? next : p === next ? current : p);
    setMatches((list) => list.map((m) => (m.round === round && !isLocked(m) ? { ...m, a: [swap(m.a[0]), swap(m.a[1])], b: [swap(m.b[0]), swap(m.b[1])] } : m)));
    setDirty(true);
  };

  const slot = (id: string, round: number, locked: boolean) => (
    <span key={id} className={styles.slot}>
      <span className={styles.slotAvatar}>
        <MemberAvatar name={names.get(id) ?? "?"} size={22} />
      </span>
      {locked || disabledReason ? (
        <span className={styles.slotName}>{names.get(id) ?? "?"}</span>
      ) : (
        <>
          <select className={styles.slotSelect} value={id} aria-label={`Ganti ${names.get(id) ?? "pemain"}`} onChange={(e) => replaceSlot(round, id, e.target.value)}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {names.get(p.id)}
              </option>
            ))}
          </select>
          <AdminIcon name="caret-down" size={12} className={styles.slotCaret} />
        </>
      )}
    </span>
  );

  const gamesPerPlayer = stats.minGames === stats.maxGames ? `${stats.maxGames} match / pemain` : `${stats.minGames}–${stats.maxGames} match / pemain`;

  return (
    <FormCard
      title="Match list & line-up"
      subtitle="Atur siapa lawan siapa di tiap ronde. Tetap bisa diubah saat Live untuk court yang belum ada skornya."
      action={
        !disabledReason && (
          <span className={editor.cardActions}>
            <AdminButton size="sm" icon="sparkle" onClick={generate} disabled={playable === 0 || saving}>
              {matches.length ? "Acak ulang" : "Generate otomatis"}
            </AdminButton>
            <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save} disabled={!dirty || saving || outOfFormat || unknown}>
              {saving ? "Menyimpan…" : "Simpan line-up"}
            </AdminButton>
          </span>
        )
      }
    >
      <div className={styles.chips}>
        <span className={styles.chip}>{players.length} pemain</span>
        <span className={styles.chip}>{rounds} ronde</span>
        <span className={styles.chip}>
          {playable} court{playable < courts && ` (dari ${courts})`}
        </span>
        {matches.length > 0 && <span className={styles.chip}>{gamesPerPlayer}</span>}
        {matches.length > 0 && (
          <span className={cx(styles.chip, stats.repeatedPartners || stats.maxGames - stats.minGames > 1 ? styles.chipWarn : styles.chipGood)}>
            {[
              stats.maxGames - stats.minGames > 1 ? "Jumlah main belum rata" : "Seimbang",
              stats.repeatedPartners ? `${stats.repeatedPartners} pasangan berulang` : "tidak ada pasangan berulang",
            ].join(" · ")}
          </span>
        )}
        {matches.length > 0 && levels && (
          <span className={cx(styles.chip, stats.maxLevelGap > 1 ? styles.chipWarn : styles.chipGood)} title="Selisih total level dua tim di satu court (Beginner = 1 … Advanced = 5)">
            Selisih level tim maks {stats.maxLevelGap}
          </span>
        )}
      </div>

      {disabledReason ? (
        <p className={styles.info}>
          <AdminIcon name="question" size={16} />
          {disabledReason}
        </p>
      ) : playable === 0 ? (
        <p className={cx(styles.info, styles.warn)}>
          <AdminIcon name="warning-circle" size={16} />
          Butuh minimal 4 peserta untuk membuat line-up — impor peserta dari Kuyy dulu.
        </p>
      ) : matches.length === 0 ? (
        <p className={styles.info}>
          <AdminIcon name="question" size={16} />
          Belum ada line-up. Klik &quot;Generate otomatis&quot; — tiap pemain dapat jumlah main yang sama dan tidak berpasangan dengan orang yang sama dua kali.
        </p>
      ) : (
        <>
          {(outOfFormat || unknown) && (
            <p className={cx(styles.info, styles.warn)}>
              <AdminIcon name="warning-circle" size={16} />
              {unknown ? "Daftar peserta berubah sejak line-up dibuat" : "Jumlah court/ronde berubah"} — klik &quot;Acak ulang&quot; untuk menyesuaikan.
            </p>
          )}
          <div className={styles.rounds} role="tablist" aria-label="Ronde">
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={round === r}
                className={cx(styles.round, round === r && styles.roundOn, lockedRounds.has(r) && styles.roundDone)}
                onClick={() => setRound(r)}
              >
                R{r}
              </button>
            ))}
          </div>

          <div className={styles.courts}>
            {roundMatches.map((m) => {
              const locked = isLocked(m);
              return (
                <div key={m.court} className={styles.court}>
                  <div className={styles.courtRow}>
                    <span className={styles.courtLabel}>
                      <strong>C{m.court}</strong>
                      <span>Court</span>
                    </span>
                    <div className={styles.teams}>
                      <span className={styles.team}>{m.a.map((p) => slot(p, round, locked))}</span>
                      <span className={locked ? styles.score : styles.vs}>{locked ? `${m.scoreA}–${m.scoreB}` : "vs"}</span>
                      <span className={styles.team}>{m.b.map((p) => slot(p, round, locked))}</span>
                    </div>
                  </div>
                  {locked && (
                    <Badge tone="lime" icon="check-circle">
                      Skor masuk · terkunci
                    </Badge>
                  )}
                  {scoring !== null && scoring === m.id ? (
                    <ScoreInput
                      target={targetPoints}
                      teamA={m.a.map((p) => names.get(p)).join(" + ")}
                      teamB={m.b.map((p) => names.get(p)).join(" + ")}
                      initial={m.scoreA}
                      busy={saving}
                      onCancel={() => setScoring(null)}
                      onSave={(a, b) => saveScore(m, a, b)}
                    />
                  ) : (
                    !disabledReason &&
                    m.id &&
                    !dirty && (
                      <button type="button" className={editor.linkButton} onClick={() => setScoring(m.id!)}>
                        {locked ? "Edit skor" : "Input skor"}
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>

          {resting.length > 0 && (
            <div className={styles.rest}>
              <span className={styles.restLabel}>
                Rest di ronde {round} · {resting.length} pemain
              </span>
              <div className={styles.team}>
                {resting.map((p) => (
                  <span key={p.id} className={styles.player}>
                    {names.get(p.id)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className={styles.info}>
            <AdminIcon name="question" size={16} />
            Pilih nama pemain di dropdown untuk ganti atau tukar (pemain rest juga bisa dipilih). Ronde yang sudah selesai dan court yang skornya sudah masuk otomatis terkunci. Jangan lupa &quot;Simpan line-up&quot;.
          </p>
        </>
      )}
    </FormCard>
  );
}

/**
 * Input skor host: cukup atur salah satu tim, tim lawan = target − skor itu. Total selalu
 * tepat target (mis. 21 → 10–11), jadi tidak mungkin melebihi target.
 */
function ScoreInput({
  target,
  teamA,
  teamB,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  target: number;
  teamA: string;
  teamB: string;
  initial: number | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (a: number, b: number) => void;
}) {
  const [a, setA] = useState(initial ?? Math.ceil(target / 2));
  const clamp = (n: number) => Math.max(0, Math.min(target, Number.isFinite(n) ? Math.round(n) : 0));
  const b = target - a;

  const row = (label: string, value: number, set: (n: number) => void) => (
    <div className={styles.scoreRow}>
      <span className={styles.scoreTeam}>{label}</span>
      <span className={styles.stepper}>
        <button type="button" aria-label={`Kurangi skor ${label}`} disabled={value <= 0} onClick={() => set(value - 1)}>
          −
        </button>
        <input inputMode="numeric" aria-label={`Skor ${label}`} value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, "") || 0))} />
        <button type="button" aria-label={`Tambah skor ${label}`} disabled={value >= target} onClick={() => set(value + 1)}>
          +
        </button>
      </span>
    </div>
  );

  return (
    <div className={styles.scoreInput}>
      {row(teamA, a, (n) => setA(clamp(n)))}
      {row(teamB, b, (n) => setA(target - clamp(n)))}
      <span className={editor.muted}>
        Total {a + b} / {target} · skor tim lawan terisi otomatis
      </span>
      <span className={styles.actions}>
        <AdminButton size="sm" onClick={onCancel} disabled={busy}>
          Batal
        </AdminButton>
        <AdminButton variant="primary" size="sm" icon="check-bold" onClick={() => onSave(a, b)} disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan & verifikasi"}
        </AdminButton>
      </span>
    </div>
  );
}
