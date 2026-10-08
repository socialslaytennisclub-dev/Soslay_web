import type { ReactNode } from "react";
import { SectionIntro, SessionCard } from "@/components/ui";
import { activityTypeLabel, sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { venueHrefByName } from "@/content/venues";
import { formatJamRange, formatTanggal } from "@/lib/format";
import styles from "./SessionGrid.module.css";

type SessionGridProps = {
  id: string;
  title: string;
  description?: string;
  sessions: Session[];
  /** past: sesi yang sudah lewat → tanpa tombol booking, kartu mengarah ke halaman venue. */
  variant?: "upcoming" | "past";
  /** Konten kecil di bawah deskripsi (mis. ajakan panduan peserta). */
  aside?: ReactNode;
};

/** Judul section + grid 2 kolom kartu sesi (Figma 25:522–25:558). */
export function SessionGrid({ id, title, description, sessions, variant = "upcoming", aside }: SessionGridProps) {
  if (sessions.length === 0) return null;
  const past = variant === "past";

  return (
    <div className={styles.group}>
      <div className={styles.heading}>
        <SectionIntro id={id} title={title} description={description} className={styles.intro} />
        {aside}
      </div>
      <ul className={styles.grid} aria-labelledby={id}>
        {sessions.map((session) => (
          <li key={session.slug} data-anim="reveal">
            <SessionCard
              venueName={session.venue.name}
              dateLabel={formatTanggal(sessionStart(session), sessionTimeZone(session))}
              timeLabel={formatJamRange(session.start, session.end)}
              badge={activityTypeLabel(session.type)}
              image={session.image}
              imagePosition={session.imagePosition}
              href={past ? venueHrefByName(session.venue.name) : session.bookingUrl}
              ctaLabel={past ? null : undefined}
              cursorLabel={past ? "Lihat" : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
