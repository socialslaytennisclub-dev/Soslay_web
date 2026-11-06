"use client";

import { useState, useSyncExternalStore, type MouseEvent } from "react";
import { FilterChips, VenueCard, type FilterChip } from "@/components/ui";
import { isCitySlug, venueCities, venueHref, type CitySlug, type Venue } from "@/content/venues";
import { splitInHalf } from "@/lib/array";
import styles from "./VenueDirectory.module.css";

/**
 * Filter kota di /venue dijalankan di browser: halaman tetap statis (dari cache Vercel) dan
 * ganti kota tidak perlu request ke server. URL tetap ?city=… supaya bisa dibagikan.
 *
 * State = "versi:kota". Versi naik setiap kota berganti. Animasi reveal hanya untuk tampilan awal
 * "All" (sama dengan HTML statis); setelah difilter kartu langsung tampil — elemen [data-anim] yang
 * muncul belakangan tidak diproses GSAP dan akan tersembunyi.
 *
 * URL bisa berubah lewat chip (pushState), Back/Forward (popstate), atau router Next saat datang dari
 * link lain (mis. breadcrumb /venue?city=bali). Router Next juga memakai history.pushState/replaceState,
 * jadi keduanya dibungkus untuk memberi tahu komponen.
 */
const readCity = () => new URLSearchParams(window.location.search).get("city") ?? "";
const listeners = new Set<() => void>();
let version = 0;
let lastCity = "";

function onUrlChange() {
  const city = readCity();
  if (city !== lastCity) {
    lastCity = city;
    version += 1;
  }
  // Ditunda: router Next menulis URL di tengah commit React, update state tidak boleh di situ.
  queueMicrotask(() => listeners.forEach((listener) => listener()));
}

if (typeof window !== "undefined") {
  lastCity = readCity();
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      onUrlChange();
    };
  }
  window.addEventListener("popstate", onUrlChange);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => `${version}:${readCity()}`;
// Server & hydrasi: halaman statis tanpa query → semua kota.
const serverSnapshot = () => "0:";

function useCityFilter() {
  const [mountVersion] = useState(() => version);
  const [v, city] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(":");
  return { city: isCitySlug(city) ? city : undefined, animate: Number(v) === mountVersion && !city };
}

function select(event: MouseEvent<HTMLElement>) {
  const link = (event.target as HTMLElement).closest("a");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  // Fase capture: dicegah sebelum handler <Link>, jadi tidak ada navigasi router / request server.
  // pushState bawaan browser tersinkron dengan router Next (tanpa render ulang di server).
  window.history.pushState(null, "", link.getAttribute("href"));
}

const cityHref = (slug?: CitySlug) => (slug ? `/venue?city=${slug}` : "/venue");

export function VenueCityChips() {
  const { city } = useCityFilter();
  const chips: FilterChip[] = [
    { label: "All", href: cityHref(), active: !city },
    ...venueCities.map((item) => ({ label: item.label, href: cityHref(item.slug), active: item.slug === city })),
  ];
  return (
    <div onClickCapture={select} className={styles.filter}>
      <FilterChips items={chips} label="Filter by city" tone="dark" />
    </div>
  );
}

export function VenueCityGrid({ venues }: { venues: Venue[] }) {
  const { city, animate } = useCityFilter();
  const cityName = venueCities.find((item) => item.slug === city)?.city;
  const [left, right] = splitInHalf(cityName ? venues.filter((venue) => venue.city === cityName) : venues);

  return (
    <div className={styles.grid}>
      {[left, right].map((column, index) => (
        <ul key={index} className={styles.column} data-parallax={index === 0 ? "-6" : undefined}>
          {column.map((venue) => (
            <li key={venue.slug} data-anim={animate ? "reveal" : undefined}>
              <VenueCard {...venue} href={venueHref(venue)} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
