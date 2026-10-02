import Image from "next/image";
import { Button, Container, NavyBackdrop, Text } from "@/components/ui";
import { activityPage, sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { formatJamRange, formatTanggal } from "@/lib/format";
import styles from "./ActivityHero.module.css";

type ActivityHeroProps = {
  session: Session;
};

/** Figma 25:497 — sesi unggulan "Aktivitas mendatang" di atas latar navy + swoosh. */
export function ActivityHero({ session }: ActivityHeroProps) {
  const dateLabel = formatTanggal(sessionStart(session), sessionTimeZone(session));
  const timeLabel = formatJamRange(session.start, session.end);

  return (
    <section className={styles.hero} aria-labelledby="activity-hero-title">
      <NavyBackdrop className={styles.backdrop} />

      <Container className={styles.layout}>
        <div className={styles.text}>
          <div className={styles.heading}>
            <p className={styles.eyebrow} data-anim="fade-up">
              {activityPage.eyebrow}
            </p>
            <Text as="h1" id="activity-hero-title" variant="heading-48" tone="white" className={styles.title} data-anim="split">
              {session.title}
            </Text>
          </div>

          <dl className={styles.details} data-anim="fade-up">
            <div className={styles.detail}>
              <dt className="visually-hidden">Tanggal</dt>
              <dd className={styles.detailMain}>{dateLabel}</dd>
              <dd className={styles.detailSub}>{timeLabel}</dd>
            </div>
            <div className={styles.detail}>
              <dt className="visually-hidden">Lokasi</dt>
              <dd className={styles.detailMain}>{session.venue.name}</dd>
              {session.venue.address && <dd className={styles.detailSub}>{session.venue.address}</dd>}
            </div>
          </dl>
        </div>

        <div className={styles.actions} data-anim="fade-up">
          <Button href={activityPage.absensi.href} variant="secondary" className={styles.absensi}>
            {activityPage.absensi.label}
          </Button>
          <Button href={session.bookingUrl} variant="arrow" target="_blank" rel="noopener noreferrer">
            {activityPage.booking.label}
          </Button>
        </div>

        <div className={styles.photo} data-anim="reveal">
          <Image
            className={styles.image}
            src={session.image}
            alt={`Sesi ${session.title} di ${session.venue.name}`}
            fill
            preload
            sizes="(min-width: 1200px) 666px, 100vw"
            style={{ objectPosition: session.imagePosition }}
          />
        </div>
      </Container>
    </section>
  );
}
