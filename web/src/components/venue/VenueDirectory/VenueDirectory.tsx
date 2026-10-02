import { Container, FilterChips, Text, VenueCard, type FilterChip } from "@/components/ui";
import { venueCities, venueHref, venuePage, type CitySlug, type Venue } from "@/content/venues";
import { splitInHalf } from "@/lib/array";
import styles from "./VenueDirectory.module.css";

type VenueDirectoryProps = {
  venues: Venue[];
  activeCity?: CitySlug;
};

/** Figma 25:758 — section navy: judul + chip kota + grid 2 kolom zig-zag (kolom kiri turun 200px). */
export function VenueDirectory({ venues, activeCity }: VenueDirectoryProps) {
  const [left, right] = splitInHalf(venues);
  const chips: FilterChip[] = [
    { label: "Semua", href: "/venue#daftar-venue", active: !activeCity },
    ...venueCities.map((city) => ({
      label: city.label,
      href: `/venue?city=${city.slug}#daftar-venue`,
      active: city.slug === activeCity,
    })),
  ];

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
          <FilterChips items={chips} label="Filter kota" tone="dark" className={styles.filter} />
        </header>

        <div className={styles.grid}>
          {[left, right].map((column, index) => (
            <ul key={index} className={styles.column} data-parallax={index === 0 ? "-6" : undefined}>
              {column.map((venue) => (
                <li key={venue.slug} data-anim="reveal">
                  <VenueCard {...venue} href={venueHref(venue)} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </Container>
    </section>
  );
}
