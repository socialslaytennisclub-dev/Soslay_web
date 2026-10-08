import Link from "next/link";
import { Button } from "../Button/Button";
import { MediaCard } from "../MediaCard/MediaCard";
import styles from "./SessionCard.module.css";

export type SessionCardProps = {
  venueName: string;
  dateLabel: string;
  timeLabel: string;
  /** Label kecil di pojok, mis. jenis aktivitas. */
  badge?: string;
  image: string;
  imagePosition?: string;
  href: string;
  /** `null` → tanpa tombol (mis. sesi yang sudah lewat). */
  ctaLabel?: string | null;
  /** Label kursor custom saat hover. */
  cursorLabel?: string;
};

/**
 * Figma: kartu sesi di halaman Activity (25:528) — foto venue, nama, tanggal & jam,
 * tombol "Booking Session di Kuyy" yang muncul saat hover (selalu tampil di layar sentuh).
 * Seluruh kartu adalah satu link: ke halaman booking (eksternal), atau ke halaman venue untuk sesi yang sudah lewat.
 */
export function SessionCard({
  venueName,
  dateLabel,
  timeLabel,
  badge,
  image,
  imagePosition,
  href,
  ctaLabel = "Booking Session di Kuyy",
  cursorLabel = "Booking",
}: SessionCardProps) {
  const external = /^https?:/.test(href);
  const content = (
    <MediaCard
      className={styles.card}
      src={image}
      objectPosition={imagePosition}
      sizes="(min-width: 1200px) 633px, (min-width: 768px) 50vw, 100vw"
      corner={badge ? <span className={styles.badge}>{badge}</span> : undefined}
    >
      <div className={styles.body}>
        <div className={styles.info}>
          <h3 className={styles.name}>{venueName}</h3>
          <p className={styles.date}>{dateLabel}</p>
          <p className={styles.time}>{timeLabel}</p>
        </div>
        {ctaLabel && (
          <span className={styles.cta}>
            <Button as="span" variant="arrow" size="sm">
              {ctaLabel}
            </Button>
          </span>
        )}
      </div>
    </MediaCard>
  );
  const label = `${ctaLabel ?? venueName}: ${venueName}, ${dateLabel}, ${timeLabel}`;

  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      data-cursor={cursorLabel}
      aria-label={label}
    >
      {content}
    </a>
  ) : (
    <Link
      href={href}
      className={styles.link}
      data-cursor={cursorLabel}
      aria-label={`Lihat ${venueName}, sesi ${dateLabel}`}
    >
      {content}
    </Link>
  );
}
