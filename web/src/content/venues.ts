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
  /** Wilayah, mis. "Central Jakarta" — breadcrumb & kartu info hero Venue detail. */
  area?: string;
  /** Kota asli di master venue (mis. "Jakarta Pusat"); `city` = wilayah website (Jakarta / Bali). */
  cityName?: string;
  /** Warna court dari master venue, mis. "Terracotta-walled" → "Terracotta-walled court". */
  courtColor?: string;
};

/**
 * Kartu info hero Venue detail & Participant Guide, tersambung ke master venue:
 * Tipe court · "<Warna> court" · kota (bahasa Inggris), dan tagline sebagai catatan tulisan tangan + ✦ otomatis.
 */
export function venueCardInfo(venue: Venue, cityInEnglish: (city: string) => string): { facts: string[]; note?: string } {
  const color = venue.courtColor?.trim();
  const court = color ? (/\bcourts?$/i.test(color) ? color : `${color} court`) : null;
  const tagline = venue.tagline.trim().replace(/\s*✦+$/, "").replace(/\.$/, "").trim();
  return {
    facts: [venue.type, court, cityInEnglish(venue.cityName ?? venue.city)].filter((x): x is string => Boolean(x)),
    note: tagline ? `${tagline} ✦` : undefined,
  };
}

const IMG = "/images/home";

export const venueList: Venue[] = [
  { slug: "ayana-midplaza-jakarta", name: "AYANA Midplaza Jakarta", city: "Jakarta", type: "Indoor", image: `${IMG}/venue-ayana.webp`, imagePosition: "50% 40%" , tagline: "An indoor court in the heart of Sudirman — keep playing even when it rains.", description: "An indoor hard court with even lighting. A favorite for early Weekly MABAR sessions before the Jakarta traffic kicks in.", area: "Central Jakarta", cityName: "Jakarta Pusat" },
  { slug: "raffles-hotel-jakarta", name: "Raffles Hotel Jakarta", city: "Jakarta", type: "Rooftop", image: `${IMG}/venue-raffles.webp`, imagePosition: "50% 50%" , tagline: "A rooftop court overlooking the Kuningan skyline.", description: "Play high above the city with the Jakarta sky as your backdrop. Perfect for afternoon coaching and sunset rallies.", area: "South Jakarta", cityName: "Jakarta Selatan" },
  { slug: "common-grounds-menteng", name: "Common Grounds Menteng", city: "Jakarta", type: "Outdoor", image: `${IMG}/venue-common-grounds.webp`, imagePosition: "50% 50%" , tagline: "Iconic terracotta walls, leafy shade, and always photogenic.", description: "A hidden tennis courtyard in the heart of Menteng. Check upcoming sessions, the participant guide, and highlights from past sessions — all on one page.", heroImage: "/images/venues/common-grounds-hero.webp", area: "Central Jakarta", cityName: "Jakarta Pusat", courtColor: "Terracotta-walled" },
  { slug: "rana-grounds", name: "Rana Grounds", city: "Jakarta", type: "Indoor", image: "/images/venues/venue-rana-grounds.webp", imagePosition: "50% 50%", tagline: "white roof, green grass, tennis whites", description: "Rana Grounds is a place to play, connect, and enjoy the game. Featuring a synthetic grass tennis court in the heart of Mampang, South Jakarta, this venue offers a comfortable space for your tennis sessions, from casual rallies to competitive matches.", area: "Mampang", cityName: "Jakarta Selatan", courtColor: "Synthetic-grass" },
  { slug: "maison-playcourt", name: "Maison Playcourt", city: "Jakarta", type: "Premium", image: `${IMG}/venue-maison.webp`, imagePosition: "50% 50%" , tagline: "A premium clay court with resort vibes in the middle of the city.", description: "A soft clay surface and a warm, inviting venue. Home of our Tennis Match Day." },
  { slug: "kula-mani-tennis-village", name: "Kula Mani Tennis Village", city: "Bali", type: "Premium", image: `${IMG}/venue-kula-mani.webp`, imagePosition: "50% 60%" , tagline: "A tennis village in Bali surrounded by coconut trees.", description: "Blue courts and cool Bali mornings. Our basecamp for Tennis Escape and Sunset Rally sessions." },
  { slug: "swan-paradise-pramana", name: "Swan Paradise Pramana", city: "Bali", type: "Tropical", image: `${IMG}/venue-swan-paradise.webp`, imagePosition: "50% 50%" , tagline: "A tropical grass court — tennis that feels like a holiday.", description: "A grass court in the middle of a tropical garden. Sessions usually end with brunch together." },
];

export const venueCities = [
  { slug: "jakarta", label: "Jakarta", city: "Jakarta" },
  { slug: "bali", label: "Bali", city: "Bali" },
] as const satisfies { slug: string; label: string; city: City }[];

export type CitySlug = (typeof venueCities)[number]["slug"];

export function isCitySlug(value: unknown): value is CitySlug {
  return venueCities.some((city) => city.slug === value);
}

/** Link daftar venue per kota (/venue?city=…; dilayani /venue/kota/[city] lewat rewrite di next.config). */
export const cityHref = (slug?: CitySlug) => (slug ? `/venue?city=${slug}` : "/venue");

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
    eyebrow: "Soslay Venues",
    title: "The Best Places for Every Rally",
    highlight: "Every Rally",
    description: "We only play where it looks good — from Jakarta rooftops to tropical courts in Bali.",
    cta: { label: "Explore venues", href: "#daftar-venue" },
    meta: ["6 curated venues", "Jakarta & Bali", "A photographer at every session"],
    image: {
      src: "/images/venues/common-grounds-hero.webp",
      alt: "Common Grounds Menteng tennis court",
      position: "50% 55%",
    },
  } satisfies PageHeroContent,
  detail: {
    eyebrow: "Venue detail",
    booking: "Book a Session on Kuyy",
    guideCta: "View Participant Guideline",
    noSession: "No sessions scheduled at this venue yet.",
    seeSchedule: "See full schedule",
    upcoming: {
      title: ["Upcoming", "Activities"],
      description: (venue: string) =>
        `The next sessions at ${venue}. Slots are limited so everyone gets comfortable play time and great photos — secure your spot early.`,
      /** Jumlah kartu sesi mendatang. */
      limit: 3,
    },
    gallery: {
      title: ["Moments from", "past sessions."],
      description: (venue: string) =>
        `Real photos from mabar sessions and events held at ${venue}. Who knows — next time it could be you in the gallery.`,
      empty: "This venue's photo gallery is coming soon — see you at the first session!",
    },
  },
  directory: {
    title: "Pick Your Favorite Court",
    description:
      "Every venue is chosen for its atmosphere, facilities, and experience. Find the court that fits your next session best.",
  },
};
