import Image from "next/image";
import Link from "next/link";
import { Button, Container, NavyBackdrop, Text } from "@/components/ui";
import { activityPage, sessionStart, sessionTimeZone, type Session } from "@/content/activity";
import { findGuide, guideHref } from "@/content/guides";
import { venuePage, type Venue } from "@/content/venues";
import { formatJamRange, formatTanggal } from "@/lib/format";
import styles from "./VenueHero.module.css";
import { blurProps } from "@/lib/image";

type VenueHeroProps = {
  venue: Venue;
  nextSession?: Session;
};

/** Figma 25:898 — nama venue di atas navy, lalu "Aktivitas mendatang" di venue ini (kiri 509) + foto 763×544 (kanan). */
export function VenueHero({ venue, nextSession }: VenueHeroProps) {
  const { detail } = venuePage;
  const image = venue.heroImage ?? venue.image;

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
          <div className={styles.info} data-anim="fade-up">
            <div className={styles.sessionHeading}>
              <p className={styles.eyebrow}>{activityPage.eyebrow}</p>
              <h2 className={styles.sessionTitle}>{nextSession ? nextSession.title : detail.noSession}</h2>
            </div>

            {nextSession ? (
              <dl className={styles.details}>
                <div className={styles.detail}>
                  <dt className="visually-hidden">Tanggal</dt>
                  <dd className={styles.detailMain}>{formatTanggal(sessionStart(nextSession), sessionTimeZone(nextSession))}</dd>
                  <dd className={styles.detailSub}>{formatJamRange(nextSession.start, nextSession.end)}</dd>
                </div>
                <div className={styles.detail}>
                  <dt className="visually-hidden">Lokasi</dt>
                  <dd className={styles.detailMain}>{nextSession.venue.name}</dd>
                  {nextSession.venue.address && <dd className={styles.detailSub}>{nextSession.venue.address}</dd>}
                </div>
              </dl>
            ) : (
              <p className={styles.detailSub}>
                <Link href="/activity" className={styles.link}>
                  {detail.seeSchedule} →
                </Link>
              </p>
            )}

            <div className={styles.actions}>
              {nextSession && (
                <Button href={nextSession.bookingUrl} variant="arrow" target="_blank" rel="noopener noreferrer">
                  {detail.booking}
                </Button>
              )}
              {findGuide(venue.slug) && (
                <Link href={guideHref(venue.slug)} className={styles.link}>
                  Baca Participant Guide →
                </Link>
              )}
            </div>
          </div>

          <div className={styles.photo} data-anim="reveal">
            <Image
              className={styles.image}
              src={image}
              {...blurProps(image)}
              alt={`Lapangan ${venue.name}`}
              fill
              preload
              sizes="(min-width: 1200px) 763px, 100vw"
              style={{ objectPosition: venue.heroImage ? undefined : venue.imagePosition }}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
