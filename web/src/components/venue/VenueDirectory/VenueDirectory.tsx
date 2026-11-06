import { Container, Text } from "@/components/ui";
import { venuePage, type CitySlug, type Venue } from "@/content/venues";
import { VenueCityFilter } from "./VenueCityFilter";
import styles from "./VenueDirectory.module.css";

/**
 * Figma 25:758 — section navy: judul + chip kota + grid 2 kolom zig-zag (kolom kiri turun 200px).
 * Kota awal dari halaman (/venue atau /venue/kota/[city]); ganti kota di browser, lihat VenueCityFilter.
 */
export function VenueDirectory({ venues, initialCity }: { venues: Venue[]; initialCity?: CitySlug }) {
  return (
    <section className={styles.section} aria-labelledby="venue-directory-title" id="daftar-venue">
      <Container className={styles.inner}>
        <VenueCityFilter
          venues={venues}
          initialCity={initialCity}
          heading={
            <div className={styles.heading}>
              <Text as="h2" id="venue-directory-title" variant="heading-42" tone="white" data-anim="split">
                {venuePage.directory.title}
              </Text>
              <Text variant="body-16" tone="white" muted data-anim="fade-up">
                {venuePage.directory.description}
              </Text>
            </div>
          }
        />
      </Container>
    </section>
  );
}
