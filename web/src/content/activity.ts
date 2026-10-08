import { CITY_TIMEZONE, type City } from "@/lib/format";

/**
 * Data sesi aktivitas (dummy, struktur mengikuti PRD §6.5 / tabel `activities`).
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
};

const KUY = "https://kuy.id/soslay";
const VENUE_IMG = "/images/home";

export const sessions: Session[] = [
  {
    slug: "mabar-di-bali-altitude-kintamani",
    title: "Mabar di Bali [Altitude Kintamani] with Photographer",
    type: "tennis-escape",
    venue: {
      name: "Altitude Tennis Court",
      city: "Bali",
      address: "Jalan, Buahan, Kec. Kintamani, Kabupaten Bangli, Bali, 80652",
    },
    date: "2026-10-04",
    start: "07:00",
    end: "11:00",
    image: "/images/activity/featured-altitude.webp",
    imagePosition: "40% 55%",
    bookingUrl: `${KUY}/mabar-di-bali`,
    featured: true,
  },
  {
    slug: "weekly-mabar-ayana-04-okt",
    title: "Weekly MABAR",
    type: "weekly-mabar",
    venue: { name: "AYANA Midplaza Jakarta", city: "Jakarta" },
    date: "2026-10-04",
    start: "07:00",
    end: "11:00",
    image: `${VENUE_IMG}/venue-ayana.webp`,
    imagePosition: "50% 45%",
    bookingUrl: `${KUY}/weekly-mabar-ayana`,
  },
  {
    slug: "match-day-maison-05-okt",
    title: "Tennis Match Day",
    type: "match-day",
    venue: { name: "Maison Playcourt", city: "Jakarta" },
    date: "2026-10-05",
    start: "08:00",
    end: "12:00",
    image: `${VENUE_IMG}/venue-maison.webp`,
    bookingUrl: `${KUY}/match-day-maison`,
  },
  {
    slug: "beginner-coaching-raffles-06-okt",
    title: "Beginner Coaching",
    type: "beginner-coaching",
    venue: { name: "Raffles Hotel Jakarta", city: "Jakarta" },
    date: "2026-10-06",
    start: "16:00",
    end: "18:00",
    image: `${VENUE_IMG}/venue-raffles.webp`,
    bookingUrl: `${KUY}/beginner-coaching-raffles`,
  },
  {
    slug: "mabar-session-common-grounds-10-okt",
    title: "Mabar Session",
    type: "weekly-mabar",
    venue: { name: "Common Grounds Menteng", city: "Jakarta" },
    date: "2026-10-10",
    start: "07:00",
    end: "11:00",
    image: `${VENUE_IMG}/venue-common-grounds.webp`,
    bookingUrl: `${KUY}/mabar-common-grounds`,
  },
  {
    slug: "weekly-mabar-ayana-11-okt",
    title: "Weekly MABAR",
    type: "weekly-mabar",
    venue: { name: "AYANA Midplaza Jakarta", city: "Jakarta" },
    date: "2026-10-11",
    start: "07:00",
    end: "10:00",
    image: `${VENUE_IMG}/venue-ayana.webp`,
    imagePosition: "50% 45%",
    bookingUrl: `${KUY}/weekly-mabar-ayana`,
  },
  {
    slug: "sunset-rally-kula-mani-17-okt",
    title: "Sunset Rally Bali",
    type: "tennis-escape",
    venue: { name: "Kula Mani Tennis Village", city: "Bali" },
    date: "2026-10-17",
    start: "16:00",
    end: "19:00",
    image: `${VENUE_IMG}/venue-kula-mani.webp`,
    bookingUrl: `${KUY}/sunset-rally-kula-mani`,
  },
  {
    slug: "tennis-brunch-swan-paradise-18-okt",
    title: "Tennis + Brunch",
    type: "social",
    venue: { name: "Swan Paradise Pramana", city: "Bali" },
    date: "2026-10-18",
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

export function activityTypeLabel(slug: ActivityTypeSlug): string {
  return activityTypes.find((type) => type.slug === slug)?.label ?? slug;
}

/** Copy statis halaman Activity. */
export const activityPage = {
  eyebrow: "Aktivitas mendatang",
  absensi: { label: "Absensi Kehadiran", href: "/absensi" },
  booking: { label: "Booking Session di Kuyy" },
  upcoming: {
    title: "Court Sudah Menunggu. Kamu Kapan?",
    description:
      "Mabar santai, match day, sampai tennis escape — pilih jadwal yang pas, booking di Kuyy, dan sampai jumpa di court. Slot favorit biasanya cepat penuh.",
  },
  past: {
    title: "Rally Kemarin, Cerita Hari Ini.",
    description:
      "Sesi-sesi yang sudah lewat — buka kartunya untuk lihat venue dan foto-fotonya. Siapa tahu jadi inspirasi sesi kamu berikutnya.",
    /** Jumlah sesi lama yang ditampilkan. */
    limit: 6,
  },
  empty: {
    title: "Belum ada sesi untuk kategori ini.",
    description: "Coba kategori lain, atau pantau Instagram kami untuk jadwal terbaru.",
  },
};
