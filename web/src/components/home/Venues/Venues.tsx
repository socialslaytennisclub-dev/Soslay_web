import { Button, Container, Icon, Text, VenueCard } from "@/components/ui";
import { venues } from "@/content/home";
import { venueHref } from "@/content/venues";
import { splitInHalf } from "@/lib/array";
import styles from "./Venues.module.css";

export function Venues() {
  // Kolom kanan diberi offset vertikal (staggered) seperti di Figma.
  const [left, right] = splitInHalf(venues.items);

  return (
    <section className={styles.section} aria-labelledby="venues-title">
      <Container className={styles.inner}>
        <header className={styles.header}>
          <Text as="h2" id="venues-title" variant="heading-52" tone="accent" className={styles.title} data-anim="split">
            {venues.title}
          </Text>
          <div className={styles.description} data-anim="fade-up">
            <Text variant="body-16" tone="on-inverse" muted>
              {venues.description}
            </Text>
            <ul className={styles.locations}>
              {venues.locations.map((location) => (
                <li key={location.city} className={styles.location}>
                  <Icon name="map-pin" />
                  <Text as="span" variant="body-18" tone="on-inverse">
                    {location.city}&nbsp; {location.text}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        </header>

        <div className={styles.grid}>
          {[left, right].map((column, index) => (
            <ul key={index} className={styles.column} data-parallax={index === 1 ? "-8" : undefined}>
              {column.map((venue) => (
                <li key={venue.slug} data-anim="reveal">
                  <VenueCard {...venue} href={venueHref(venue)} />
                </li>
              ))}
            </ul>
          ))}
        </div>

        <div className={styles.cta} data-anim="fade-up">
          <Button href={venues.cta.href} variant="arrow" size="sm">
            {venues.cta.label}
          </Button>
        </div>
      </Container>
    </section>
  );
}
