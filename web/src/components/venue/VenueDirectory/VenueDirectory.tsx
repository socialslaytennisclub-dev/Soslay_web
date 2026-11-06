import { Container, Text } from "@/components/ui";
import { venuePage, type Venue } from "@/content/venues";
import { VenueCityChips, VenueCityGrid } from "./VenueCityFilter";
import styles from "./VenueDirectory.module.css";

/**
 * Figma 25:758 — section navy: judul + chip kota + grid 2 kolom zig-zag (kolom kiri turun 200px).
 * Filter kota (?city=jakarta | bali) dijalankan di browser, lihat VenueCityFilter.
 */
export function VenueDirectory({ venues }: { venues: Venue[] }) {
  return (
    <section className={styles.section} aria-labelledby="venue-directory-title" id="daftar-venue">
      <Container className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <Text as="h2" id="venue-directory-title" variant="heading-42" tone="white" data-anim="split">
              {venuePage.directory.title}
            </Text>
            <Text variant="body-16" tone="white" muted data-anim="fade-up">
              {venuePage.directory.description}
            </Text>
          </div>
          <VenueCityChips />
        </header>

        <VenueCityGrid venues={venues} />
      </Container>
    </section>
  );
}
