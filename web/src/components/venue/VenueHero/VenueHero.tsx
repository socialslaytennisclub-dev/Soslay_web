import Image from "next/image";
import Link from "next/link";
import { Button, Container, NavyBackdrop, Text } from "@/components/ui";
import { sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { venuePage, type Venue } from "@/content/venues";
import { formatJamRange, formatTanggal } from "@/lib/format";
import styles from "./VenueHero.module.css";

type VenueHeroProps = {
  venue: Venue;
  nextSession?: Session;
};

/** Figma 25:898 — nama venue di atas navy, lalu deskripsi | foto 666×544 | info sesi berikutnya + booking. */
export function VenueHero({ venue, nextSession }: VenueHeroProps) {
  const { detail } = venuePage;

  return (
    <section className={styles.hero} aria-labelledby="venue-title">
      <Container className={styles.inner}>
        <header className={styles.heading}>
          {/* Backdrop ditempel ke blok judul → mudah diperpanjang sampai setengah foto di mobile */}
          <NavyBackdrop className={styles.backdrop} />
          <Text as="h1" id="venue-title" variant="heading-48" tone="white" align="center" className={styles.title} data-anim="split">
            {venue.name}
          </Text>
          <Text variant="body-16" tone="white" align="center" muted className={styles.tagline} data-anim="fade-up">
            {venue.tagline}
          </Text>
        </header>

        <div className={styles.body}>
          <Text variant="body-16" tone="primary" muted className={styles.description}>
            {venue.description}
          </Text>

          <div className={styles.photo} data-anim="reveal">
            <Image
              className={styles.image}
              src={venue.heroImage ?? venue.image}
              alt={`Lapangan ${venue.name}`}
              fill
              preload
              sizes="(min-width: 1200px) 666px, 100vw"
              style={{ objectPosition: venue.heroImage ? undefined : venue.imagePosition }}
            />
          </div>

          <aside className={styles.info} aria-label={detail.nextSession} data-anim="fade-up">
            <div className={styles.details}>
              <p className={styles.eyebrow}>{detail.nextSession}</p>
              <p className={styles.venueName}>{venue.name}</p>
              {nextSession ? (
                <>
                  <p className={styles.date}>{formatTanggal(sessionStart(nextSession), sessionTimeZone(nextSession))}</p>
                  <p className={styles.time}>{formatJamRange(nextSession.start, nextSession.end)}</p>
                </>
              ) : (
                <p className={styles.time}>
                  {detail.noSession} <Link href="/activity">{detail.seeSchedule}</Link>
                </p>
              )}
            </div>
            {nextSession && (
              <Button href={nextSession.bookingUrl} variant="arrow" target="_blank" rel="noopener noreferrer">
                {detail.booking}
              </Button>
            )}
          </aside>
        </div>
      </Container>
    </section>
  );
}
