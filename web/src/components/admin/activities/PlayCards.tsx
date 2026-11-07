"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateLineup, hasTargetTotal, lineupStats, playableCourts, type LevelWeights, type LineupMatch } from "@/lib/americano";
import { cx } from "@/lib/cx";
import { useScoreDraft } from "@/hooks/useScoreDraft";
import { correctSessionResult, saveLineup, saveMatchScore } from "@/server/admin/actions/play";
import type { MatchFormat, SessionMatch, SessionParticipant, TennisLevel } from "@/server/admin/types";
import { FormCard, SingleChips, Toggle } from "../ui/AdminForm";
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
  const withTarget = hasTargetTotal(value.matchFormat);
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
          <SingleChips
            label="Format leaderboard *"
            options={RANKINGS}
            value={value.leaderboardMode}
            onChange={(leaderboardMode) => set({ leaderboardMode })}
            hint={<span className={editor.muted}>Win: peringkat dari jumlah menang · Point: dari total poin. Nilai sama → selisih skor yang lebih besar di atas.</span>}
          />

          <div className={withTarget ? editor.cols3 : editor.cols2}>
            <NumberField label="Jumlah court" suffix="court" value={value.courtCount} onChange={(v) => set({ courtCount: v })} disabled={locked} />
            <NumberField label="Jumlah ronde" suffix="ronde" value={value.roundCount} onChange={(v) => set({ roundCount: v })} />
            {/* Rotating Partner tanpa target poin — skor bebas sesuai hasil di lapangan. */}
            {withTarget && <NumberField label="Target poin" suffix="/ match" value={value.targetPoints} onChange={(v) => set({ targetPoints: v })} disabled={locked} />}
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
              {withTarget
                ? `Ronde tanpa batas waktu — match selesai saat total poin kedua tim = ${value.targetPoints || "target"} (mis. 12–9).`
                : "Tanpa target poin — host mengisi skor sesuai hasil di lapangan (mis. 6–4)."}
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
  ended = false,
  disabledReason,
}: {
  sessionId: string;
  participants: SessionParticipant[];
  courts: number;
  rounds: number;
  /** null = tanpa target poin (Rotating Partner): skor bebas. */
  targetPoints: number | null;
  /** Rotating Partner: tim di tiap court diseimbangkan per level. */
  balanceLevels: boolean;
  initial: SessionMatch[];
  /** Activity sudah berakhir → hasil terkunci; admin bisa masuk mode "Koreksi hasil". */
  ended?: boolean;
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
  const [correcting, setCorrecting] = useState(false);
  const [matches, setMatches] = useState<SessionMatch[]>(initial);
  const [round, setRound] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();

  const playable = playableCourts(players.length, courts);
  const hasScore = (m: SessionMatch) => m.scoreA !== null;
  // Mode koreksi: semua court bisa diubah, termasuk yang sudah ada skornya.
  const isLocked = (m: SessionMatch) => hasScore(m) && !correcting;
  const editable = !disabledReason && (!ended || correcting);
  const lockedRounds = new Set(matches.filter(hasScore).map((m) => m.round));
  const matchKey = (m: SessionMatch) => `${m.round}:${m.court}`;
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

  const cancelCorrection = () => {
    if (dirty && !window.confirm("Buang perubahan koreksi?")) return;
    setMatches(initial);
    setCorrecting(false);
    setDirty(false);
    setScoring(null);
  };

  const saveCorrection = () => {
    if (!window.confirm("Simpan koreksi hasil? Line-up & skor diganti, lalu bonus juara dihitung ulang (bonus lama dikoreksi otomatis).")) return;
    startSaving(async () => {
      const result = await correctSessionResult(sessionId, matches);
      toast.result(result);
      if (result.ok) {
        setCorrecting(false);
        setDirty(false);
        setScoring(null);
        router.refresh();
      }
    });
  };

  /** Mode koreksi: skor hanya diubah di draft, baru tersimpan lewat "Simpan koreksi". */
  const setDraftScore = (m: SessionMatch, a: number | null, b: number | null) => {
    setMatches((list) => list.map((x) => (matchKey(x) === matchKey(m) ? { ...x, scoreA: a, scoreB: b } : x)));
    setDirty(true);
    setScoring(null);
  };

  const removeMatch = (m: SessionMatch) => {
    setMatches((list) => list.filter((x) => matchKey(x) !== matchKey(m)));
    setDirty(true);
    setScoring(null);
  };

  const saveScore = (m: SessionMatch, a: number, b: number) =>
    correcting ? setDraftScore(m, a, b) : startSaving(async () => {
      const result = await saveMatchScore(sessionId, m.id!, a, b);
      toast.result(result);
      if (result.ok) {
        setMatches((list) => list.map((x) => (x.id === m.id ? { ...x, scoreA: a, scoreB: b } : x)));
        setScoring(null);
      }
    });

  const roundMatches = matches.filter((m) => m.round === round).sort((x, y) => x.court - y.court);
  const playing = new Set(roundMatches.flatMap((m) => [...m.a, ...m.b]));
  // Pemain di court yang skornya sudah masuk tidak bisa dipindah — jangan tawarkan di dropdown.
  const lockedPlayers = new Set(roundMatches.filter(isLocked).flatMap((m) => [...m.a, ...m.b]));
  const resting = players.filter((p) => !playing.has(p.id));

  /** Mode koreksi: court yang ternyata dimainkan tapi belum ada di line-up → isi 4 pemain rest pertama. */
  const addMatch = (court: number) => {
    const [p1, p2, p3, p4] = resting.map((p) => p.id);
    if (!p4) return;
    setMatches((list) => [...list, { round, court, a: [p1, p2], b: [p3, p4], scoreA: null, scoreB: null }]);
    setDirty(true);
  };

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
      {locked || !editable ? (
        <span className={styles.slotName}>{names.get(id) ?? "?"}</span>
      ) : (
        <>
          <select className={styles.slotSelect} value={id} aria-label={`Ganti ${names.get(id) ?? "pemain"}`} onChange={(e) => replaceSlot(round, id, e.target.value)}>
            {players.filter((p) => p.id === id || !lockedPlayers.has(p.id)).map((p) => (
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
        ended && !disabledReason ? (
          <span className={editor.cardActions}>
            {correcting ? (
              <>
                <AdminButton size="sm" onClick={cancelCorrection} disabled={saving}>
                  Batal
                </AdminButton>
                <AdminButton variant="primary" size="sm" icon="check-bold" onClick={saveCorrection} disabled={!dirty || saving || outOfFormat || unknown}>
                  {saving ? "Menyimpan…" : "Simpan koreksi"}
                </AdminButton>
              </>
            ) : (
              (matches.length > 0 || playable > 0) && (
                <AdminButton size="sm" icon="pencil-simple" onClick={() => setCorrecting(true)}>
                  Koreksi hasil
                </AdminButton>
              )
            )}
          </span>
        ) : (
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
      ) : matches.length === 0 && !correcting ? (
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
                      <span className={hasScore(m) ? styles.score : styles.vs}>{hasScore(m) ? `${m.scoreA}–${m.scoreB}` : "vs"}</span>
                      <span className={styles.team}>{m.b.map((p) => slot(p, round, locked))}</span>
                    </div>
                  </div>
                  {locked && (
                    <Badge tone="lime" icon="check-circle">
                      Skor masuk · terkunci
                    </Badge>
                  )}
                  {scoring === matchKey(m) ? (
                    <ScoreInput
                      target={targetPoints}
                      teamA={m.a.map((p) => names.get(p)).join(" + ")}
                      teamB={m.b.map((p) => names.get(p)).join(" + ")}
                      initial={m.scoreA}
                      initialB={m.scoreB}
                      busy={saving}
                      onCancel={() => setScoring(null)}
                      saveLabel={correcting ? "Pakai skor" : undefined}
                      onSave={(a, b) => saveScore(m, a, b)}
                    />
                  ) : (
                    (correcting || (editable && m.id && !dirty)) && (
                      <span className={styles.actions}>
                        <button type="button" className={editor.linkButton} onClick={() => setScoring(matchKey(m))}>
                          {hasScore(m) ? "Edit skor" : "Input skor"}
                        </button>
                        {correcting && hasScore(m) && (
                          <button type="button" className={editor.linkButton} onClick={() => setDraftScore(m, null, null)}>
                            Hapus skor
                          </button>
                        )}
                        {correcting && (
                          <button type="button" className={editor.linkButton} onClick={() => removeMatch(m)}>
                            Hapus match
                          </button>
                        )}
                      </span>
                    )
                  )}
                </div>
              );
            })}
            {correcting &&
              Array.from({ length: courts }, (_, i) => i + 1)
                .filter((c) => !roundMatches.some((m) => m.court === c))
                .map((c) => (
                  <div key={c} className={styles.court}>
                    <div className={styles.courtRow}>
                      <span className={styles.courtLabel}>
                        <strong>C{c}</strong>
                        <span>Court</span>
                      </span>
                      <span className={editor.muted}>Belum ada match di ronde {round}</span>
                    </div>
                    <AdminButton size="sm" icon="plus-bold" onClick={() => addMatch(c)} disabled={resting.length < 4} title={resting.length < 4 ? "Butuh 4 pemain rest" : undefined}>
                      Tambah match
                    </AdminButton>
                  </div>
                ))}
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

          {correcting ? (
            <p className={cx(styles.info, styles.warn)}>
              <AdminIcon name="warning-circle" size={16} />
              Mode koreksi: semua ronde & court bisa diubah — ganti pemain lewat dropdown, ubah atau hapus skor. Perubahan baru tersimpan setelah &quot;Simpan koreksi&quot;; bonus juara lalu dihitung ulang otomatis.
            </p>
          ) : ended ? (
            <p className={styles.info}>
              <AdminIcon name="question" size={16} />
              Activity sudah berakhir — line-up & skor terkunci. Kalau ada yang salah, klik &quot;Koreksi hasil&quot;.
            </p>
          ) : (
            <p className={styles.info}>
              <AdminIcon name="question" size={16} />
              Pilih nama pemain di dropdown untuk ganti atau tukar (pemain rest juga bisa dipilih). Ronde yang sudah selesai dan court yang skornya sudah masuk otomatis terkunci. Jangan lupa &quot;Simpan line-up&quot;.
            </p>
          )}
        </>
      )}
    </FormCard>
  );
}

/**
 * Input skor host. Dengan target (Americano): cukup atur salah satu tim, tim lawan = target − skor itu,
 * jadi total selalu tepat target (mis. 21 → 10–11). Tanpa target (Rotating Partner): kedua skor bebas.
 */
function ScoreInput({
  target,
  teamA,
  teamB,
  initial,
  initialB,
  busy,
  saveLabel = "Simpan & verifikasi",
  onCancel,
  onSave,
}: {
  target: number | null;
  teamA: string;
  teamB: string;
  initial: number | null;
  initialB: number | null;
  busy: boolean;
  saveLabel?: string;
  onCancel: () => void;
  onSave: (a: number, b: number) => void;
}) {
  const { a, b, max, valid, setA, setB } = useScoreDraft(target, initial, initialB);

  const row = (label: string, value: number, set: (n: number) => void) => (
    <div className={styles.scoreRow}>
      <span className={styles.scoreTeam}>{label}</span>
      <span className={styles.stepper}>
        <button type="button" aria-label={`Kurangi skor ${label}`} disabled={value <= 0} onClick={() => set(value - 1)}>
          −
        </button>
        <input inputMode="numeric" aria-label={`Skor ${label}`} value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, "") || 0))} />
        <button type="button" aria-label={`Tambah skor ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
          +
        </button>
      </span>
    </div>
  );

  return (
    <div className={styles.scoreInput}>
      {row(teamA, a, setA)}
      {row(teamB, b, setB)}
      <span className={editor.muted}>{target === null ? "Isi skor kedua tim sesuai hasil di lapangan" : `Total ${a + b} / ${target} · skor tim lawan terisi otomatis`}</span>
      <span className={styles.actions}>
        <AdminButton size="sm" onClick={onCancel} disabled={busy}>
          Batal
        </AdminButton>
        <AdminButton variant="primary" size="sm" icon="check-bold" onClick={() => onSave(a, b)} disabled={busy || !valid}>
          {busy ? "Menyimpan…" : saveLabel}
        </AdminButton>
      </span>
    </div>
  );
}
