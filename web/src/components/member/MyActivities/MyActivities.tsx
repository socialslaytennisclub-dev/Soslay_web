import { Chip, MediaCard } from "@/components/ui";
import { memberSessions, myActivitiesPage, type MemberSession } from "@/content/member";
import { formatJamRange, formatTanggalISO } from "@/lib/format";
import styles from "./MyActivities.module.css";

/** Figma 25:1951 — "Terbaru" (sesi terdaftar) & "Lampau" (riwayat + poin). */
export function MyActivities() {
  const upcoming = memberSessions.filter((s) => s.status !== "done").sort((a, b) => a.date.localeCompare(b.date));
  const past = memberSessions.filter((s) => s.status === "done").sort((a, b) => b.date.localeCompare(a.date));

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
              <ActivityTicket session={session} />
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
      <h3 className={styles.venue}>{session.venue}</h3>
      <p className={styles.date}>
        <time dateTime={session.date}>{formatTanggalISO(session.date, session.city)}</time>
      </p>
      <p className={styles.time}>
        {formatJamRange(session.start, session.end)} <span className="visually-hidden">· {session.title}</span>
      </p>
    </MediaCard>
  );
}
