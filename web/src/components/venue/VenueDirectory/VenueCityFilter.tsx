"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { FilterChips, VenueCard, type FilterChip } from "@/components/ui";
import { cityHref, isCitySlug, venueCities, venueHref, type CitySlug, type Venue } from "@/content/venues";
import { splitInHalf } from "@/lib/array";
import styles from "./VenueDirectory.module.css";

const cityOf = (href: string) => {
  const city = new URL(href, window.location.href).searchParams.get("city");
  return isCitySlug(city) ? city : undefined;
};

/**
 * Chip kota + grid venue di /venue. Kota awal datang dari server (/venue/kota/[city] untuk
 * ?city=…, jadi HTML statis sudah terfilter). Ganti kota di browser: state lokal +
 * window.history.pushState — Next 16 menyinkronkan pushState bawaan dengan routernya, jadi
 * tidak ada request ke server. Back/Forward dibaca dari popstate.
 *
 * Animasi reveal hanya untuk tampilan awal (dari HTML statis); setelah kota diganti kartu langsung
 * tampil — elemen [data-anim] yang muncul belakangan tidak diproses GSAP dan akan tersembunyi.
 */
export function VenueCityFilter({ venues, initialCity, heading }: { venues: Venue[]; initialCity?: CitySlug; heading: ReactNode }) {
  const [city, setCity] = useState(initialCity);
  const [changed, setChanged] = useState(false);
  /** Ganti kota setelah tampilan awal (kartu baru tanpa animasi reveal). */
  const show = (next: CitySlug | undefined) => {
    setCity(next);
    setChanged(true);
  };

  useEffect(() => {
    const sync = () => show(cityOf(window.location.href));
    // Back ke entri hasil pushState memulihkan tree halaman asal (kota awal bisa beda dengan URL),
    // jadi saat dipasang kota disamakan dengan URL; setelahnya ikuti Back/Forward.
    if (cityOf(window.location.href) !== initialCity) sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [initialCity]);

  const select = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    // Fase capture: dicegah sebelum handler <Link>, jadi tidak ada navigasi router / request server.
    event.preventDefault();
    const href = link.getAttribute("href") ?? cityHref();
    window.history.pushState(null, "", href);
    show(cityOf(href));
  };

  const chips: FilterChip[] = [
    { label: "All", href: cityHref(), active: !city },
    ...venueCities.map((item) => ({ label: item.label, href: cityHref(item.slug), active: item.slug === city })),
  ];
  const cityName = venueCities.find((item) => item.slug === city)?.city;
  const [left, right] = splitInHalf(cityName ? venues.filter((venue) => venue.city === cityName) : venues);

  return (
    <>
      <header className={styles.header}>
        {heading}
        <div onClickCapture={select} className={styles.filter}>
          <FilterChips items={chips} label="Filter by city" tone="dark" />
        </div>
      </header>

      <div className={styles.grid}>
        {[left, right].map((column, index) => (
          <ul key={index} className={styles.column} data-parallax={index === 0 ? "-6" : undefined}>
            {column.map((venue) => (
              <li key={venue.slug} data-anim={changed ? undefined : "reveal"}>
                <VenueCard {...venue} href={venueHref(venue)} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </>
  );
}
