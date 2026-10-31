import { CITY_TIMEZONE, type City } from "@/lib/format";

/**
 * Data sesi aktivitas (dummy, struktur mengikuti PRD §6.5 / tabel `activities`). Tanggalnya hanya
 * titik awal: di mode demo jadwal digeser ke depan (lib/demo-dates) supaya tidak kedaluwarsa.
 * Nanti diganti fetch dari API/CMS — komponen hanya bergantung pada tipe `Session`.
 */

export const activityTypes = [
  { slug: "weekly-mabar", label: "Weekly MABAR" },
  { slug: "match-day", label: "Tennis Match Day" },
  { slug: "tennis-escape", label: "Tennis Escape" },
  { slug: "beginner-coaching", label: "Beginner Coaching" },
  { slug: "social", label: "Social" },
] as const;

export type ActivityTypeSlug = (typeof activityTypes)[number]["slug"];

export type Session = {
  slug: string;
  title: string;
  /** Waktu sesi dibuat di admin (ISO) — urutan "terbaru ditambahkan" di grid upcoming. */
  createdAt?: string;
  type: ActivityTypeSlug;
  venue: { name: string; city: City; address?: string };
  /** Tanggal & jam lokal venue. */
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  image: string;
  imagePosition?: string;
  bookingUrl: string;
  /** Kandidat untuk hero "Aktivitas mendatang". */
  featured?: boolean;
  /** Harga mulai (Rupiah), kapasitas, sisa slot & level — kartu "Upcoming Activities" (Venue detail). */
  price?: number;
  capacity?: number;
  slotsLeft?: number;
  levels?: TennisLevel[];
};

export type TennisLevel = "beginner" | "beginner_intermediate" | "intermediate" | "intermediate_advanced" | "advanced";

const LEVEL_LABEL: Record<TennisLevel, string> = {
  beginner: "Beginner",
  beginner_intermediate: "Beginner–Intermediate",
  intermediate: "Intermediate",
  intermediate_advanced: "Intermediate–Advanced",
  advanced: "Advanced",
};

const LEVEL_ORDER = Object.keys(LEVEL_LABEL) as TennisLevel[];

/** [] → "All levels", ["beginner"] → "Beginner", beberapa level → "Beginner–Intermediate". */
export function levelLabel(levels: TennisLevel[] = []): string {
  if (!levels.length || levels.length === LEVEL_ORDER.length) return "All levels";
  const sorted = [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  const first = LEVEL_LABEL[sorted[0]].split("–")[0];
  const last = LEVEL_LABEL[sorted[sorted.length - 1]].split("–").pop()!;
  return first === last ? first : `${first}–${last}`;
}

const KUY = "https://kuy.id/soslay";
const VENUE_IMG = "/images/home";

export const sessions: Session[] = [
  {
    slug: "mabar-di-bali-altitude-kintamani",
    title: "Mabar in Bali [Altitude Kintamani] with Photographer",
    type: "tennis-escape",
    venue: {
      name: "Altitude Tennis Court",
      city: "Bali",
      address: "Jalan, Buahan, Kec. Kintamani, Kabupaten Bangli, Bali, 80652",
    },
    date: "2026-11-08",
    start: "07:00",
    end: "11:00",
    image: "/images/activity/featured-altitude.webp",
    imagePosition: "40% 55%",
    bookingUrl: `${KUY}/mabar-di-bali`,
    featured: true,
  },
  {
    slug: "weekly-mabar-ayana",
    title: "Weekly MABAR",
    type: "weekly-mabar",
    venue: { name: "AYANA Midplaza Jakarta", city: "Jakarta" },
    date: "2026-10-25",
    start: "07:00",
    end: "11:00",
    image: `${VENUE_IMG}/venue-ayana.webp`,
    imagePosition: "50% 45%",
    bookingUrl: `${KUY}/weekly-mabar-ayana`,
  },
  {
    slug: "match-day-maison",
    title: "Tennis Match Day",
    type: "match-day",
    venue: { name: "Maison Playcourt", city: "Jakarta" },
    date: "2026-11-01",
    start: "08:00",
    end: "12:00",
    image: `${VENUE_IMG}/venue-maison.webp`,
    bookingUrl: `${KUY}/match-day-maison`,
  },
  {
    slug: "beginner-coaching-raffles",
    title: "Beginner Coaching",
    type: "beginner-coaching",
    venue: { name: "Raffles Hotel Jakarta", city: "Jakarta" },
    date: "2026-11-04",
    start: "16:00",
    end: "18:00",
    image: `${VENUE_IMG}/venue-raffles.webp`,
    bookingUrl: `${KUY}/beginner-coaching-raffles`,
  },
  {
    slug: "mabar-session-common-grounds",
    title: "Mabar Session",
    type: "weekly-mabar",
    venue: { name: "Common Grounds Menteng", city: "Jakarta" },
    date: "2026-11-14",
    start: "07:00",
    end: "11:00",
    image: `${VENUE_IMG}/venue-common-grounds.webp`,
    bookingUrl: `${KUY}/mabar-common-grounds`,
  },
  {
    slug: "weekly-mabar-ayana-3-jam",
    title: "Weekly MABAR",
    type: "weekly-mabar",
    venue: { name: "AYANA Midplaza Jakarta", city: "Jakarta" },
    date: "2026-11-22",
    start: "07:00",
    end: "10:00",
    image: `${VENUE_IMG}/venue-ayana.webp`,
    imagePosition: "50% 45%",
    bookingUrl: `${KUY}/weekly-mabar-ayana`,
  },
  {
    slug: "sunset-rally-kula-mani",
    title: "Sunset Rally Bali",
    type: "tennis-escape",
    venue: { name: "Kula Mani Tennis Village", city: "Bali" },
    date: "2026-12-05",
    start: "16:00",
    end: "19:00",
    image: `${VENUE_IMG}/venue-kula-mani.webp`,
    bookingUrl: `${KUY}/sunset-rally-kula-mani`,
  },
  {
    slug: "tennis-brunch-swan-paradise",
    title: "Tennis + Brunch",
    type: "social",
    venue: { name: "Swan Paradise Pramana", city: "Bali" },
    date: "2026-12-13",
    start: "07:00",
    end: "11:00",
    image: `${VENUE_IMG}/venue-swan-paradise.webp`,
    bookingUrl: `${KUY}/tennis-brunch-swan-paradise`,
  },
];

/** Waktu mulai sesi sebagai Date (memperhitungkan WIB/WITA). */
export function sessionStart(session: Session): Date {
  const offset = session.venue.city === "Bali" ? "+08:00" : "+07:00";
  return new Date(`${session.date}T${session.start}:00${offset}`);
}

export function sessionTimeZone(session: Session): string {
  return CITY_TIMEZONE[session.venue.city];
}

export function isActivityType(value: unknown): value is ActivityTypeSlug {
  return activityTypes.some((type) => type.slug === value);
}

/**
 * Halaman per tipe aktivitas (Figma Website v2 347:2665 · 347:2831 · 347:2997 · 347:3163):
 * hero wordmark raksasa + jadwal sesi tipe tersebut.
 */
export const activityLandings = [
  {
    path: "mabar",
    type: "weekly-mabar",
    wordmark: "Mabar",
    title: "Weekly MABAR for Every Level",
    highlight: "Every Level",
    description: "Casual hit-arounds every week at our favorite courts — meet new people, rally, and take home pro photos.",
    meta: ["Every week", "All levels", "A photographer at every session"],
    image: { src: "/images/home/activity-weekly-mabar.webp", alt: "A Weekly MABAR session on an outdoor court", position: "50% 72%" },
    about: {
      heading: "What is Mabar?",
      title: "Tennis together, every single week.",
      image: { src: "/images/home/community-group.webp", alt: "Soslay members lined up on court after a Weekly MABAR", position: "50% 60%" },
      paragraphs: [
        "Mabar — short for main bareng, “playing together” — is our weekly community session. No tournament, no pressure: just book a slot, show up, and rally with whoever's on court.",
        "Our hosts mix players by level and rotate partners so everyone gets court time, makes new friends, and leaves with pro photos from the session.",
      ],
      points: [
        { title: "Every week", text: "Regular slots at our favorite courts in Jakarta & Bali." },
        { title: "Rotating partners", text: "Hosts pair you by level, so every rally feels fun and fair." },
        { title: "Pro photos", text: "A photographer at every session — tag-ready shots, delivered." },
      ],
    },
  },
  {
    path: "event",
    type: "match-day",
    wordmark: "Event",
    title: "Tennis Events Worth Showing Up For",
    highlight: "Showing Up For",
    description: "Match days, socials, and special sessions — the moments the community looks forward to all month.",
    meta: ["Match days & socials", "Jakarta & Bali", "Limited slots"],
    image: { src: "/images/home/activity-match-day.webp", alt: "Players at a Soslay Tennis Match Day", position: "50% 20%" },
    about: {
      heading: "What is Match Day?",
      title: "Real matches, friendly vibes.",
      image: { src: "/images/home/community-highfive.webp", alt: "Players shaking hands at the net after a Match Day game", position: "50% 55%" },
      paragraphs: [
        "Match Day is where rallies turn into real games. Players are grouped by level and play scored matches — doubles or singles — in a format that's competitive but still all about the community.",
        "It's the best way to test your game, meet players at your level, and celebrate together after the last point.",
      ],
      points: [
        { title: "Scored matches", text: "Short-format games with real points — every match counts." },
        { title: "Level-based groups", text: "Play opponents close to your level for tight, fun matches." },
        { title: "Prizes & photos", text: "Winners take home prizes, everyone takes home great shots." },
      ],
    },
  },
  {
    path: "escape",
    type: "tennis-escape",
    wordmark: "Escape",
    title: "Tennis Escapes to Beautiful Courts",
    highlight: "Beautiful Courts",
    description: "Trips that mix tennis, travel, and the right people — from Bali villages to mountain courts in Kintamani.",
    meta: ["Bali & beyond", "Courts + stay", "A photographer on every trip"],
    image: { src: "/images/home/activity-tennis-escape.webp", alt: "Members on a Soslay Tennis Escape in Bali", position: "50% 50%" },
    about: {
      heading: "What is Escape?",
      title: "A tennis trip, planned for you.",
      image: { src: "/images/activity/featured-altitude.webp", alt: "Members rallying at Altitude Tennis Court in Kintamani, Bali", position: "45% 50%" },
      paragraphs: [
        "Tennis Escape is a short getaway built around tennis. We pick a beautiful court outside the city, sort out the sessions, and bring the community along — you just pack your racket.",
        "Expect morning hits with a view, time to explore in between, and a trip you'll want to repeat with the people you met there.",
      ],
      points: [
        { title: "Beautiful courts", text: "From Bali villages to mountain courts in Kintamani." },
        { title: "All arranged", text: "Court sessions and itinerary planned — just book and show up." },
        { title: "Trip photographer", text: "Every moment captured, on court and off." },
      ],
    },
  },
  {
    path: "coaching",
    type: "beginner-coaching",
    wordmark: "Coaching",
    title: "Beginner Coaching, No Pressure",
    highlight: "No Pressure",
    description: "New to tennis? Learn the basics, build your confidence, and start playing with the community.",
    meta: ["Small groups", "Beginner friendly", "Rackets available"],
    image: { src: "/images/home/activity-beginner-coaching.webp", alt: "A coach guiding beginners on court", position: "50% 85%" },
  },
] as const satisfies {
  path: string;
  type: ActivityTypeSlug;
  wordmark: string;
  title: string;
  highlight: string;
  description: string;
  meta: string[];
  image: { src: string; alt: string; position: string };
  /** Section "apa itu …?" tepat di bawah hero. */
  about?: ActivityAbout;
}[];

export type ActivityAbout = {
  /** Label kecil ("What is Mabar?") di atas `title`. */
  heading: string;
  title: string;
  image: { src: string; alt: string; position?: string };
  paragraphs: readonly string[];
  points: readonly { title: string; text: string }[];
};

export type ActivityLanding = (typeof activityLandings)[number];

/** Link tipe aktivitas: halaman khusus bila ada, selain itu filter di /activity. */
export function activityTypeHref(slug: ActivityTypeSlug): string {
  const landing = activityLandings.find((l) => l.type === slug);
  return landing ? `/activity/${landing.path}` : `/activity?type=${slug}`;
}

export function activityTypeLabel(slug: ActivityTypeSlug): string {
  return activityTypes.find((type) => type.slug === slug)?.label ?? slug;
}

/** Copy statis halaman Activity. */
export const activityPage = {
  eyebrow: "Upcoming activity",
  absensi: { label: "Check-in Attendance", href: "/akun/absensi" },
  booking: { label: "Book a Session on Kuyy" },
  upcoming: {
    title: "The Court Is Waiting. Are You?",
    description:
      "Casual mabar, match day, or a tennis escape — pick the schedule that fits, book on Kuyy, and see you on the court. Favorite slots usually fill up fast.",
  },
  past: {
    title: "Yesterday's Rally, Today's Story.",
    description:
      "Past sessions — open a card to see the venue and its photos. Who knows, it might inspire your next session.",
    /** Jumlah sesi lama yang ditampilkan. */
    limit: 6,
  },
  empty: {
    title: "No sessions in this category yet.",
    description: "Try another category, or follow our Instagram for the latest schedule.",
  },
};
