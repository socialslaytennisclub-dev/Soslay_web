import { SectionIntro, SessionCard } from "@/components/ui";
import { activityTypeLabel, sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { formatJamRange, formatTanggal } from "@/lib/format";
import styles from "./SessionGrid.module.css";

type SessionGridProps = {
  id: string;
  title: string;
  description?: string;
  sessions: Session[];
};

/** Judul section + grid 2 kolom kartu sesi (Figma 25:522–25:558). */
export function SessionGrid({ id, title, description, sessions }: SessionGridProps) {
  if (sessions.length === 0) return null;

  return (
    <div className={styles.group}>
      <SectionIntro id={id} title={title} description={description} className={styles.intro} />
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
              href={session.bookingUrl}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
