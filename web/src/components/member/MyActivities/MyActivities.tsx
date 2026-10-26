import Link from "next/link";
import { Chip, MediaCard } from "@/components/ui";
import { myActivitiesPage, splitSessions, type MemberSession } from "@/content/member";
import { formatJamRange, formatTanggalISO } from "@/lib/format";
import styles from "./MyActivities.module.css";

/** Figma 25:1951 — "Terbaru" (sesi terdaftar) & "Lampau" (riwayat + poin). */
export function MyActivities({ sessions }: { sessions: MemberSession[] }) {
  const { upcoming, past } = splitSessions(sessions);

  return (
    <>
      <ActivityGroup id="aktivitas-terbaru" {...myActivitiesPage.upcoming} sessions={upcoming} />
      <ActivityGroup id="aktivitas-lampau" {...myActivitiesPage.past} sessions={past} />
    </>
  );
}

type ActivityGroupProps = {
  id: string;
  title: string;
  subtitle: string;
  empty: string;
  sessions: MemberSession[];
};

function ActivityGroup({ id, title, subtitle, empty, sessions }: ActivityGroupProps) {
  return (
    <section className={styles.group} aria-labelledby={id}>
      <header className={styles.header}>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>
      {sessions.length ? (
        <ul className={styles.grid}>
          {sessions.map((session) => (
            <li key={session.slug}>
              <Link href={`/akun/aktivitas/${session.slug}`} className={styles.cardLink} aria-label={`Detail sesi ${session.title}`}>
                <ActivityTicket session={session} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </section>
  );
}

function ActivityTicket({ session }: { session: MemberSession }) {
  const done = session.status === "done";

  return (
    <MediaCard
      as="article"
      src={session.image}
      alt=""
      overlay="50"
      radius="lg"
      sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw"
      className={styles.card}
      cornerAlign="start"
      corner={
        done ? (
          <>
            <Chip tone="white">Selesai</Chip>
            {session.points ? <Chip tone="navy">+{session.points} pts</Chip> : null}
          </>
        ) : (
          <Chip tone="lime">Terdaftar</Chip>
        )
      }
    >
      <h3 className={styles.cardTitle}>{session.title}</h3>
      <p className={styles.date}>
        <time dateTime={session.date}>{formatTanggalISO(session.date, session.city)}</time>
      </p>
      <p className={styles.time}>
        {formatJamRange(session.start, session.end)} · {session.venue}
      </p>
    </MediaCard>
  );
}
