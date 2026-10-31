"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { formatTanggalPendek } from "@/lib/format";
import type { MemberSessionDetail, MyReview } from "@/server/member/session-detail";
import { submitSessionReview } from "@/server/member/actions";
import styles from "./SessionDetail.module.css";

const HIGHLIGHTS = ["Host ramah", "Format seru", "Lapangan bagus", "Tepat waktu", "Ketemu teman baru", "Dokumentasi"];
const MOOD = ["", "Kurang", "Biasa aja", "Lumayan", "Seru", "Seru banget"];
const DETAILS = [
  ["host", "Host"],
  ["venue", "Venue"],
  ["format", "Format & line-up"],
] as const;
const MAX = 500;

type Draft = Omit<MyReview, "updatedAt">;
const EMPTY: Draft = { rating: 0, highlights: [], host: null, venue: null, format: null, comment: "", testimonial: false };

function Stars({ value, onChange, label, size = "md" }: { value: number; onChange?: (v: number) => void; label: string; size?: "md" | "sm" }) {
  return (
    <span className={cx(styles.stars, size === "sm" && styles.starsSm)} role={onChange ? "radiogroup" : "img"} aria-label={onChange ? label : `${label}: ${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} bintang`} className={cx(n <= value && styles.starOn)} onClick={() => onChange(n)}>
            ★
          </button>
        ) : (
          <span key={n} className={cx(n <= value && styles.starOn)} aria-hidden>
            ★
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Tab Review (Figma Simplify S3-P · 2c–2e): bintang + yang paling oke + rating detail + ulasan
 * (maks. 500 karakter, tanpa foto). Review pertama +10 Slay Point; bisa diubah sampai 7 hari
 * setelah sesi, setelah itu hanya bisa dibaca.
 */
export function ReviewTab({ detail: d }: { detail: MemberSessionDetail }) {
  const now = d.fetchedAt;
  const router = useRouter();
  const locked = now > new Date(d.reviewUntil).getTime();
  const [editing, setEditing] = useState(!d.myReview && !locked);
  const [draft, setDraft] = useState<Draft>(d.myReview ?? EMPTY);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((r) => ({ ...r, [key]: value }));

  const send = () =>
    startBusy(async () => {
      if (!draft.rating) return setError("Pilih bintang dulu.");
      const result = await submitSessionReview(d.id, draft);
      if (!result.ok) return setError(result.error);
      setError(null);
      setJustSent(!d.myReview);
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    const r = d.myReview ?? (justSent ? { ...draft, updatedAt: new Date(now).toISOString() } : null);
    return (
      <section className={styles.card} aria-labelledby="review-title">
        {justSent && (
          <p className={styles.reviewThanks} role="status">
            <Check size={16} aria-hidden /> Terima kasih! Review kamu sudah terkirim · +10 Slay Point
          </p>
        )}
        <header className={styles.cardHead}>
          <div>
            <h2 id="review-title" className={styles.cardTitle}>
              Review kamu
            </h2>
            <p className={styles.muted}>{locked ? "Review sudah terkunci (lewat 7 hari setelah sesi) — hanya bisa dibaca." : `Bisa diubah sampai ${formatTanggalPendek(d.reviewUntil, d.city, "dateTime")}.`}</p>
          </div>
          {!locked && r && (
            <button type="button" className={styles.link} onClick={() => setEditing(true)}>
              Ubah
            </button>
          )}
        </header>
        {r ? (
          <>
            <Stars value={r.rating} label="Rating sesi" />
            {r.highlights.length > 0 && (
              <p className={styles.reviewTags}>
                {r.highlights.map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </p>
            )}
            {DETAILS.some(([key]) => r[key]) && (
              <dl className={styles.reviewDetails}>
                {DETAILS.filter(([key]) => r[key]).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <Stars value={r[key] ?? 0} label={label} size="sm" />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {r.comment && <blockquote className={styles.reviewQuote}>&ldquo;{r.comment}&rdquo;</blockquote>}
          </>
        ) : (
          <p className={styles.muted}>Kamu tidak memberi review untuk sesi ini.</p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="review-title">
      <div>
        <h2 id="review-title" className={styles.cardTitle}>
          Gimana sesinya?
        </h2>
        <p className={styles.muted}>Rating &amp; review kamu membantu host, venue &amp; tim Soslay bikin sesi lebih seru.</p>
      </div>
      <div className={styles.reviewStars}>
        <Stars value={draft.rating} onChange={(v) => set("rating", v)} label="Rating sesi" />
        <strong>{MOOD[draft.rating] || "Pilih bintang"}</strong>
      </div>

      <fieldset className={styles.reviewSet}>
        <legend>Yang paling oke (boleh pilih lebih dari satu)</legend>
        <div className={styles.reviewChips}>
          {HIGHLIGHTS.map((h) => {
            const on = draft.highlights.includes(h);
            return (
              <button key={h} type="button" aria-pressed={on} className={cx(styles.reasonChip, on && styles.reasonChipOn)} onClick={() => set("highlights", on ? draft.highlights.filter((x) => x !== h) : [...draft.highlights, h])}>
                {h}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.reviewSet}>
        <legend>Rating detail</legend>
        {DETAILS.map(([key, label]) => (
          <div key={key} className={styles.reviewDetailRow}>
            <span>{label}</span>
            <Stars value={draft[key] ?? 0} onChange={(v) => set(key, v)} label={`Rating ${label}`} size="sm" />
          </div>
        ))}
      </fieldset>

      <label className={styles.reviewSet}>
        <span className={styles.reviewLegend}>Tulis review (opsional)</span>
        <textarea className={styles.reviewText} rows={4} maxLength={MAX} value={draft.comment} onChange={(e) => set("comment", e.target.value)} placeholder="Ceritakan pengalaman kamu di sesi ini…" />
        <span className={styles.reviewHint}>
          <span>Review tanpa foto · tampil dengan nama depan kamu</span>
          <span>
            {draft.comment.length}/{MAX}
          </span>
        </span>
      </label>

      <label className={styles.reviewCheck}>
        <input type="checkbox" checked={draft.testimonial} onChange={(e) => set("testimonial", e.target.checked)} />
        Boleh ditampilkan sebagai testimoni di website
      </label>

      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.reviewActions}>
        {d.myReview && (
          <button type="button" className={styles.btnOutline} onClick={() => setEditing(false)}>
            Batal
          </button>
        )}
        <button type="button" className={styles.btnLime} onClick={send} disabled={busy}>
          {busy ? "Mengirim…" : d.myReview ? "Simpan perubahan" : "Kirim review"}
        </button>
      </div>
      {!d.myReview && <p className={styles.small}>Review pertama dapat +10 Slay Point. Bisa diubah sampai {formatTanggalPendek(d.reviewUntil, d.city, "dateTime")}.</p>}
    </section>
  );
}
