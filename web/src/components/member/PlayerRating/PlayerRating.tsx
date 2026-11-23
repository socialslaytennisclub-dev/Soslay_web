"use client";

import { ArrowLeft, Check, ChevronDown, Clock3, Lock, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/cx";
import { GROUP_LABEL, NTRP_LEVELS, UNKNOWN_LEVEL, ntrpText, type LevelGroup, type RatingQueueItem } from "@/lib/player-level";
import { firstName } from "@/lib/text";
import { ratePlayer } from "@/server/member/actions";
import styles from "./PlayerRating.module.css";

const GROUPS: LevelGroup[] = ["newbie", "beginner", "intermediate", "advanced", "pro"];
const dayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** "Kamu host Rina di Weekly Mabar (The Citadel), Sabtu 22 Nov bersama Dimas — 4× dalam 90 hari terakhir." */
function contextLine(p: RatingQueueItem) {
  if (!p.lastAt) return `Kamu pernah menilai ${firstName(p.name)} sebelumnya.`;
  const where = [p.lastTitle, p.venue && `(${p.venue})`].filter(Boolean).join(" ");
  const withCo = p.cohosts.length ? ` bersama ${p.cohosts.map(firstName).join(" & ")}` : "";
  const often = p.times > 1 ? `, dan ${p.times}× dalam 90 hari terakhir` : "";
  return `Kamu host ${firstName(p.name)} di ${where}, ${dayFmt.format(new Date(p.lastAt))}${withCo}${often}.`;
}

/** Skala NTRP bergaris warna per grup (Newbie → Pro). */
function ScaleBar() {
  return (
    <div className={styles.scaleBar} aria-hidden>
      {NTRP_LEVELS.map((l) => (
        <span key={l.value} className={styles[`g_${l.group}`]} />
      ))}
    </div>
  );
}

function LevelGuide() {
  return (
    <ul className={styles.guide}>
      {NTRP_LEVELS.map((l) => (
        <li key={l.value}>
          <span className={cx(styles.dot, styles[`g_${l.group}`])} aria-hidden />
          <strong>
            {l.label} · {l.name}
          </strong>
          <span>{l.description}</span>
        </li>
      ))}
      <li>
        <span className={cx(styles.dot, styles.g_unknown)} aria-hidden />
        <strong>{UNKNOWN_LEVEL.name}</strong>
        <span>{UNKNOWN_LEVEL.description}</span>
      </li>
    </ul>
  );
}

type Answer = number | null;
type View = { kind: "intro" } | { kind: "rate"; ids: string[]; index: number; single: boolean } | { kind: "done"; count: number } | { kind: "list" };

/**
 * Penilaian level pemain oleh host (beta, mirip Reclub): intro → satu kartu per pemain (skala NTRP vertikal,
 * deskripsi tingkat yang dipilih) → selesai. Tersimpan per kartu; berhenti di tengah = sisanya tetap menunggu.
 * `sessionTitle` diisi → antrean satu activity (prompt setelah Akhiri Activity).
 */
export function PlayerRating({ items, sessionTitle = null, backHref }: { items: RatingQueueItem[]; sessionTitle?: string | null; backHref: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Map<string, Answer>>(() => new Map(items.filter((p) => p.rated).map((p) => [p.memberId, p.ntrp])));
  const [view, setView] = useState<View>({ kind: "intro" });
  const [pick, setPick] = useState<Answer | undefined>(undefined);
  const [guide, setGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const byId = new Map(items.map((p) => [p.memberId, p]));
  // Satu activity: semua peserta yang belum saya nilai. Umum: yang `due` (belum / perlu diperbarui).
  const todo = items.filter((p) => (sessionTitle ? !p.rated : p.due)).map((p) => p.memberId);
  const rated = items.filter((p) => answers.has(p.memberId));
  const minutes = Math.max(1, Math.round(todo.length * 0.25));

  const open = (ids: string[], index: number, single = false) => {
    setPick(answers.has(ids[index]) ? answers.get(ids[index]) : undefined);
    setError(null);
    setView({ kind: "rate", ids, index, single });
  };

  const go = (v: Extract<View, { kind: "rate" }>, step: number) => {
    const next = v.index + step;
    if (next < 0) return setView(v.single ? { kind: "list" } : { kind: "intro" });
    if (next >= v.ids.length) {
      router.refresh();
      return setView(v.single ? { kind: "list" } : { kind: "done", count: v.ids.filter((id) => answers.has(id)).length });
    }
    open(v.ids, next, v.single);
  };

  const save = (v: Extract<View, { kind: "rate" }>) => {
    if (pick === undefined) return setError("Pilih level, atau \"Tidak tahu\".");
    const id = v.ids[v.index];
    startSaving(async () => {
      const result = await ratePlayer(id, pick);
      if (!result.ok) return setError(result.error);
      setAnswers((m) => new Map(m).set(id, pick));
      if (v.single) {
        router.refresh();
        return setView({ kind: "list" });
      }
      // Kartu terakhir: hitung termasuk yang baru disimpan (state belum terbarui di render ini).
      if (v.index + 1 >= v.ids.length) {
        router.refresh();
        return setView({ kind: "done", count: v.ids.filter((x) => x === id || answers.has(x)).length });
      }
      open(v.ids, v.index + 1);
    });
  };

  if (view.kind === "rate") {
    const p = byId.get(view.ids[view.index])!;
    const chosen = pick === undefined ? null : pick === null ? null : NTRP_LEVELS.find((l) => l.value === pick)!;
    return (
      <section className={styles.card} aria-labelledby="rate-name">
        <header className={styles.cardHead}>
          <button type="button" className={styles.iconBtn} onClick={() => go(view, -1)} aria-label="Kembali">
            <ArrowLeft size={20} />
          </button>
          {!view.single && (
            <div className={styles.progress}>
              <span>
                {view.index + 1} / {view.ids.length}
              </span>
              <span className={styles.progressBar}>
                <span style={{ width: `${((view.index + 1) / view.ids.length) * 100}%` }} />
              </span>
            </div>
          )}
        </header>

        <div className={styles.person}>
          <Avatar name={p.name} src={p.avatar} size={96} />
          <h1 id="rate-name" className={styles.personName}>
            {p.name}
          </h1>
          <p className={styles.context}>{contextLine(p)}</p>
        </div>

        <div className={styles.scale} role="radiogroup" aria-label={`Level ${p.name}`}>
          <p className={styles.scaleHead}>
            <span>↑ Lebih tinggi</span>
            <span>NTRP</span>
          </p>
          {[...NTRP_LEVELS].reverse().map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={pick === l.value}
              className={cx(styles.level, pick === l.value && styles.levelOn)}
              onClick={() => {
                setPick(l.value);
                setError(null);
              }}
            >
              <span className={cx(styles.levelBar, styles[`g_${l.group}`])} aria-hidden />
              <span className={styles.levelName}>{l.name}</span>
              <span className={styles.levelNum}>{l.label}</span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={pick === null}
            className={cx(styles.level, pick === null && styles.levelOn)}
            onClick={() => {
              setPick(null);
              setError(null);
            }}
          >
            <span className={cx(styles.levelBar, styles.g_unknown)} aria-hidden />
            <span className={styles.levelName}>{UNKNOWN_LEVEL.name}</span>
            <span className={styles.levelNum} />
          </button>
        </div>

        <p className={styles.chosen} aria-live="polite">
          {pick === undefined ? (
            "Pilih satu tingkat — deskripsinya muncul di sini."
          ) : chosen ? (
            <>
              <strong>
                {chosen.label} · {chosen.name}
              </strong>
              {chosen.description}
            </>
          ) : (
            <>
              <strong>{UNKNOWN_LEVEL.name}</strong>
              {UNKNOWN_LEVEL.description} Tidak ikut dihitung di level pemain.
            </>
          )}
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.btnOutline} onClick={() => go(view, view.single ? -1 : 1)} disabled={saving}>
            {view.single ? "Batal" : "Lewati"}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => save(view)} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </section>
    );
  }

  if (view.kind === "done") {
    return (
      <section className={cx(styles.card, styles.center)}>
        <span className={styles.doneIcon} aria-hidden>
          <Check size={28} />
        </span>
        <h1 className={styles.title}>Terima kasih!</h1>
        <p className={styles.lead}>{view.count ? `${view.count} pemain sudah kamu nilai.` : "Belum ada pemain yang dinilai."} Penilaianmu anonim dan membantu Soslay membuat line-up yang lebih seimbang.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.btnOutline} onClick={() => setView({ kind: "list" })}>
            Lihat yang sudah kunilai
          </button>
          <Link href={backHref} className={styles.btnPrimary}>
            Selesai
          </Link>
        </div>
      </section>
    );
  }

  if (view.kind === "list") {
    const ids = rated.map((p) => p.memberId);
    return (
      <section className={styles.card} aria-labelledby="rated-title">
        <header className={styles.cardHead}>
          <button type="button" className={styles.iconBtn} onClick={() => setView({ kind: "intro" })} aria-label="Kembali">
            <ArrowLeft size={20} />
          </button>
        </header>
        <h1 id="rated-title" className={styles.title}>
          Pemain yang sudah kunilai
        </h1>
        <p className={styles.lead}>Nilai bisa diubah kapan saja — yang dihitung selalu nilai terbaru.</p>
        {rated.length ? (
          <ul className={styles.ratedList}>
            {rated.map((p, i) => (
              <li key={p.memberId}>
                <Avatar name={p.name} src={p.avatar} size={40} />
                <span className={styles.ratedName}>
                  {p.name}
                  <small>{ntrpText(answers.get(p.memberId) ?? null)}</small>
                </span>
                <button type="button" className={styles.linkBtn} onClick={() => open(ids, i, true)}>
                  Ubah
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Belum ada pemain yang kamu nilai.</p>
        )}
      </section>
    );
  }

  // Intro
  return (
    <section className={styles.card} aria-labelledby="rating-title">
      <header className={styles.cardHead}>
        <Link href={backHref} className={styles.iconBtn} aria-label="Kembali">
          <ArrowLeft size={20} />
        </Link>
        <span className={styles.beta}>Beta · khusus host</span>
      </header>
      <h1 id="rating-title" className={styles.title}>
        Penilaian Level Pemain
      </h1>
      <p className={styles.lead}>
        {sessionTitle
          ? `Nilai level pemain dari ${sessionTitle}. Penilaianmu membantu Soslay membuat line-up yang lebih seimbang dan game yang lebih seru.`
          : "Bagikan level pemain dari activity yang kamu host. Penilaianmu membantu Soslay membuat line-up yang lebih seimbang dan game yang lebih seru untuk semua."}
      </p>

      <div className={styles.legend}>
        <strong>Panduan level (NTRP)</strong>
        <ScaleBar />
        <div className={styles.legendLabels}>
          {GROUPS.map((g) => {
            const first = NTRP_LEVELS.find((l) => l.group === g)!;
            return (
              <span key={g}>
                <b>{GROUP_LABEL[g]}</b>
                {first.label}
              </span>
            );
          })}
        </div>
        <button type="button" className={styles.guideToggle} onClick={() => setGuide((v) => !v)} aria-expanded={guide}>
          {guide ? "Tutup panduan level" : "Lihat panduan level"}
          <ChevronDown size={16} className={cx(guide && styles.flip)} aria-hidden />
        </button>
        {guide && <LevelGuide />}
      </div>

      <ul className={styles.facts}>
        <li>
          <span className={styles.factIcon}>
            <Users size={20} />
          </span>
          {todo.length ? `Nilai ${todo.length} pemain dari activity yang kamu host` : "Semua pemain sudah kamu nilai"}
        </li>
        {todo.length > 0 && (
          <li>
            <span className={styles.factIcon}>
              <Clock3 size={20} />
            </span>
            Sekitar {minutes} menit
          </li>
        )}
        <li>
          <span className={styles.factIcon}>
            <Lock size={20} />
          </span>
          Penilaianmu anonim dan tidak ditampilkan ke pemain. Nilai dari beberapa host digabung jadi perkiraan level pemain.
        </li>
      </ul>

      <div className={styles.introActions}>
        {todo.length > 0 && (
          <button type="button" className={styles.btnPrimary} onClick={() => open(todo, 0)}>
            Mulai menilai
          </button>
        )}
        <button type="button" className={styles.linkBtn} onClick={() => setView({ kind: "list" })}>
          Pemain yang sudah kunilai ({rated.length})
        </button>
      </div>
    </section>
  );
}
