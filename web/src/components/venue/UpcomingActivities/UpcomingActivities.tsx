import Image from "next/image";
import Link from "next/link";
import { Button, Container } from "@/components/ui";
import { activityTypeLabel, levelLabel, sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { venuePage } from "@/content/venues";
import { formatJamRange, formatTanggal } from "@/lib/format";
import { blurProps } from "@/lib/image";
import { SplitHeading } from "../SplitHeading/SplitHeading";
import styles from "./UpcomingActivities.module.css";

const { upcoming } = venuePage.detail;
const rupiah = new Intl.NumberFormat("id-ID");

/** "SAT · 24 OCT" di zona waktu venue. */
function dateBadge(session: Session) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: sessionTimeZone(session) })
      .formatToParts(sessionStart(session))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} · ${parts.day} ${parts.month.slice(0, 3)}`.toUpperCase();
}

function slotsLabel(slots: number) {
  if (slots <= 0) return "Fully booked";
  return `${slots} slot${slots === 1 ? "" : "s"} left`;
}

/** Figma Website v2 375:3711 — Card/Upcoming Activity. */
function UpcomingCard({ session }: { session: Session }) {
  const time = `${formatTanggal(sessionStart(session), sessionTimeZone(session))} · ${formatJamRange(session.start, session.end, " – ")}`;
  const level = `${levelLabel(session.levels)}${session.capacity ? ` · ${session.capacity} players` : ""}`;
  return (
    <li className={styles.card}>
      <div className={styles.photo}>
        <Image
          className={styles.image}
          src={session.image}
          {...blurProps(session.image)}
          alt={`${session.title} at ${session.venue.name}`}
          fill
          sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw"
          style={{ objectPosition: session.imagePosition }}
        />
        <span className={styles.dateBadge}>{dateBadge(session)}</span>
        {session.slotsLeft !== undefined && <span className={styles.slotBadge}>{slotsLabel(session.slotsLeft)}</span>}
      </div>
      <div className={styles.body}>
        <span className={styles.tag}>{activityTypeLabel(session.type)}</span>
        <h3 className={styles.cardTitle}>{session.title}</h3>
        <dl className={styles.meta}>
          <div>
            <dt>Time</dt>
            <dd>{time}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{level}</dd>
          </div>
        </dl>
        <div className={styles.footer}>
          {session.price ? (
            <p className={styles.price}>
              <span>Starting from</span>
              Rp{rupiah.format(session.price)}
            </p>
          ) : (
            <span />
          )}
          <Button href={session.bookingUrl} variant="arrow" size="sm" target="_blank" rel="noopener noreferrer" aria-label={`Book ${session.title}`}>
            Booking
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Figma Website v2 375:3700 — 3 sesi berikutnya di venue ini. */
export function UpcomingActivities({ venueName, sessions }: { venueName: string; sessions: Session[] }) {
  return (
    <section className={styles.section} aria-labelledby="upcoming-title">
      <Container className={styles.inner}>
        <SplitHeading
          id="upcoming-title"
          title={upcoming.title}
          description={upcoming.description(venueName)}
          action={
            <Link href="/activity" className={styles.seeAll}>
              {venuePage.detail.seeSchedule} →
            </Link>
          }
        />
        {sessions.length ? (
          <ul className={styles.cards} data-anim="stagger">
            {sessions.map((session) => (
              <UpcomingCard key={session.slug} session={session} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{venuePage.detail.noSession}</p>
        )}
      </Container>
    </section>
  );
}
