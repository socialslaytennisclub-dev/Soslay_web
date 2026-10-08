import type { PageHeroContent } from "@/components/sections/PageHero/PageHero";
import type { City } from "@/lib/format";

/**
 * Data venue — satu sumber untuk homepage, halaman Venue, dan (nanti) Venue detail.
 * Struktur mengikuti tabel `venues` di PRD; nanti diganti data dari CMS.
 */

export type Venue = {
  slug: string;
  name: string;
  city: City;
  /** Karakter venue: Indoor, Rooftop, Outdoor, Premium, Tropical. */
  type: string;
  image: string;
  /** Titik fokus foto (crop) mengikuti Figma. */
  imagePosition: string;
  /** Kalimat pendek untuk hero Venue detail. */
  tagline: string;
  /** Paragraf deskripsi venue. */
  description: string;
  /** Foto besar di hero Venue detail (default: `image`). */
  heroImage?: string;
};

const IMG = "/images/home";

export const venueList: Venue[] = [
  { slug: "ayana-midplaza-jakarta", name: "AYANA Midplaza Jakarta", city: "Jakarta", type: "Indoor", image: `${IMG}/venue-ayana.webp`, imagePosition: "50% 40%" , tagline: "Lapangan indoor di jantung Sudirman — tetap main walau hujan turun.", description: "Lapangan indoor dengan pencahayaan rata dan permukaan hard court. Favorit untuk Weekly MABAR pagi sebelum Jakarta macet." },
  { slug: "raffles-hotel-jakarta", name: "Raffles Hotel Jakarta", city: "Jakarta", type: "Rooftop", image: `${IMG}/venue-raffles.webp`, imagePosition: "50% 50%" , tagline: "Rooftop court dengan pemandangan kota Kuningan.", description: "Main di atas ketinggian dengan langit Jakarta sebagai latar. Cocok untuk sesi coaching sore dan sunset rally." },
  { slug: "common-grounds-menteng", name: "Common Grounds Menteng", city: "Jakarta", type: "Outdoor", image: `${IMG}/venue-common-grounds.webp`, imagePosition: "50% 50%" , tagline: "Tembok oranye ikonik, rindang, dan selalu fotogenik.", description: "Lapangan outdoor di Menteng dengan tembok oranye khas yang jadi latar foto favorit member. Suasananya santai, cocok untuk mabar pagi.", heroImage: "/images/venues/common-grounds-hero.webp" },
  { slug: "maison-playcourt", name: "Maison Playcourt", city: "Jakarta", type: "Premium", image: `${IMG}/venue-maison.webp`, imagePosition: "50% 50%" , tagline: "Clay court premium dengan nuansa resort di tengah kota.", description: "Permukaan clay yang empuk di kaki dan desain venue yang hangat. Tempat kami menggelar Tennis Match Day." },
  { slug: "kula-mani-tennis-village", name: "Kula Mani Tennis Village", city: "Bali", type: "Premium", image: `${IMG}/venue-kula-mani.webp`, imagePosition: "50% 60%" , tagline: "Tennis village di Bali yang dikelilingi pohon kelapa.", description: "Lapangan biru dengan udara Bali yang sejuk di pagi hari. Basecamp untuk sesi Tennis Escape dan Sunset Rally." },
  { slug: "swan-paradise-pramana", name: "Swan Paradise Pramana", city: "Bali", type: "Tropical", image: `${IMG}/venue-swan-paradise.webp`, imagePosition: "50% 50%" , tagline: "Grass court tropis — main tenis rasa liburan.", description: "Lapangan rumput di tengah taman tropis. Biasanya ditutup dengan brunch bareng setelah sesi." },
];

export const venueCities = [
  { slug: "jakarta", label: "Jakarta", city: "Jakarta" },
  { slug: "bali", label: "Bali", city: "Bali" },
] as const satisfies { slug: string; label: string; city: City }[];

export type CitySlug = (typeof venueCities)[number]["slug"];

export function isCitySlug(value: unknown): value is CitySlug {
  return venueCities.some((city) => city.slug === value);
}

export function venueHref(venue: Venue): string {
  return `/venue/${venue.slug}`;
}

/** Link venue dari nama di data sesi (nama sesi bisa beda tipis, mis. "Common Ground" vs "Common Grounds"). */
export function venueHrefByName(name: string): string {
  const key = name.toLowerCase().replace(/s\b/g, "");
  const venue = venueList.find((item) => item.name.toLowerCase().replace(/s\b/g, "") === key);
  return venue ? venueHref(venue) : "/venue";
}

export function findVenue(slug: string): Venue | undefined {
  return venueList.find((venue) => venue.slug === slug);
}

/** Copy halaman Venue (Figma 25:749). */
export const venuePage = {
  hero: {
    wordmark: "Venue",
    eyebrow: "Venue Soslay",
    title: "Tempat Terbaik untuk Setiap Rally",
    highlight: "Setiap Rally",
    description:
      "Kami hanya bermain di tempat yang terlihat bagus — dari rooftop Jakarta sampai lapangan tropis di Bali.",
    cta: { label: "Jelajahi venue", href: "#daftar-venue" },
    meta: ["6 venue kurasi", "Jakarta & Bali", "Fotografer di setiap sesi"],
    image: {
      src: "/images/venues/common-grounds-hero.webp",
      alt: "Lapangan tenis Common Grounds Menteng",
      position: "50% 55%",
    },
  } satisfies PageHeroContent,
  detail: {
    booking: "Booking Session di Kuyy",
    nextSession: "Sesi berikutnya",
    noSession: "Belum ada sesi terjadwal di venue ini.",
    seeSchedule: "Lihat jadwal",
    galleryTitle: "Momen di Lapangan",
    galleryEmpty: "Galeri foto venue ini segera hadir — sampai jumpa di sesi pertama!",
  },
  directory: {
    title: "Pilih Lapangan Favoritmu",
    description:
      "Setiap venue kami pilih karena suasana, fasilitas, dan pengalamannya. Temukan lapangan yang paling cocok untuk sesi berikutnya.",
  },
};
