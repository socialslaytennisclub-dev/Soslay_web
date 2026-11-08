import type { SessionReview } from "@/server/admin/types";
import { FormCard } from "../ui/AdminForm";
import { Badge } from "../ui/AdminUI";
import styles from "./SessionReviews.module.css";

const at = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** Rata-rata satu kolom rating (yang diisi saja) → "4,3" atau null. */
function average(reviews: SessionReview[], pick: (r: SessionReview) => number | null): string | null {
  const values = reviews.map(pick).filter((v): v is number => v !== null);
  if (!values.length) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length).toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

const ASPECTS = [
  ["Host", (r: SessionReview) => r.host],
  ["Venue", (r: SessionReview) => r.venue],
  ["Format", (r: SessionReview) => r.format],
] as const;

/** Admin / Edit sesi — review dari peserta & host (tab Review member), dengan rata-rata rating. */
export function SessionReviews({ reviews }: { reviews: SessionReview[] }) {
  const overall = average(reviews, (r) => r.rating);
  return (
    <FormCard title="Review peserta" subtitle={reviews.length ? `${reviews.length} review · dari tab Review di halaman sesi member` : "Review dibuka setelah sesi selesai, sampai 7 hari"}>
      {reviews.length === 0 ? (
        <p className={styles.empty}>Belum ada review.</p>
      ) : (
        <>
          <div className={styles.summary}>
            {overall && <span className={styles.stat}>Rata-rata ★ {overall}</span>}
            {ASPECTS.map(([label, pick]) => {
              const v = average(reviews, pick);
              return v && <span key={label} className={styles.stat}>{label} ★ {v}</span>;
            })}
            <span className={styles.stat}>{reviews.filter((r) => r.testimonial).length} boleh jadi testimoni</span>
          </div>
          <ul className={styles.list}>
            {reviews.map((r) => (
              <li key={r.memberId} className={styles.item}>
                <div className={styles.head}>
                  <span className={styles.name}>{r.name}</span>
                  {r.isHost && <Badge tone="lime">Host</Badge>}
                  <span className={styles.stars} aria-label={`${r.rating} dari 5 bintang`}>
                    {stars(r.rating)}
                  </span>
                  {r.testimonial && <Badge tone="neutral">Boleh jadi testimoni</Badge>}
                  <span className={styles.date}>{at.format(new Date(r.at))}</span>
                </div>
                {ASPECTS.some(([, pick]) => pick(r) !== null) && (
                  <div className={styles.details}>
                    {ASPECTS.map(([label, pick]) => {
                      const v = pick(r);
                      return v !== null && <span key={label}>{label} {v}/5</span>;
                    })}
                  </div>
                )}
                {r.highlights.length > 0 && (
                  <div className={styles.tags}>
                    {r.highlights.map((h) => (
                      <span key={h} className={styles.tag}>
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                {r.comment && <p className={styles.comment}>{r.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </FormCard>
  );
}
