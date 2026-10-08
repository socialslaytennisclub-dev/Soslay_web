import type { City } from "@/lib/format";

/**
 * Data member area (dummy, struktur mengikuti PRD §5). Nanti diganti fetch dari API
 * untuk member yang sedang login — komponen hanya bergantung pada tipe di file ini.
 */

export const memberTabs = [
  { label: "Dashboard", href: "/akun" },
  { label: "Profile", href: "/akun/profil" },
  { label: "My Activities", href: "/akun/aktivitas" },
  { label: "Order", href: "/akun/order" },
] as const;

export type MemberTier = "Basic" | "Silver" | "Gold" | "Platinum";

export const member = {
  name: "Arya Putra Dewangga",
  username: "aryasoslay67",
  email: "aryaputradewangga@gmail.com",
  tier: "Gold" as MemberTier,
  memberSince: "Juli 2025",
  memberId: "SOS 0067 2507",
  validThru: "07/26",
  cover: "/images/home/hero.webp",
  bookingUrl: "https://kuy.id/soslay",
};

/* ── Dashboard · baris 1 ─────────────────────────────────── */

export const slayActivity = {
  period: "Bulan ini",
  sessions: 12,
  unit: "sesi mabar",
  monthlyTarget: 16,
  stats: [
    { value: "18j", label: "Jam main" },
    { value: "5", label: "Venue" },
    { value: "4 mgg", label: "Streak" },
  ],
};

export const slayPoint = {
  balance: 2450,
  earnedThisWeek: 120,
  nextTier: { name: "Platinum" as MemberTier, threshold: 3000 },
  redeemCopy: "Tukar poin dengan merch & sesi gratis",
};

/* ── Dashboard · Info Grafis ─────────────────────────────── */

export type TargetRing = { key: string; label: string; value: number; target: number; color: "navy" | "indigo" | "pink" };

export const annualTargets = {
  title: "Target tahunan",
  subtitle: "Progres menuju target 2026",
  rings: [
    { key: "sesi", label: "Sesi mabar", value: 72, target: 96, color: "navy" },
    { key: "jam", label: "Jam bermain", value: 108, target: 150, color: "indigo" },
    { key: "venue", label: "Venue", value: 7, target: 10, color: "pink" },
  ] satisfies TargetRing[],
};

export const insightPeriods = [
  { value: "1m", label: "1 Bln", caption: "1 bulan terakhir", weeks: 5 },
  { value: "3m", label: "3 Bln", caption: "3 bulan terakhir", weeks: 13 },
  { value: "1y", label: "1 Thn", caption: "1 tahun terakhir", weeks: 52 },
] as const;

export type InsightPeriod = (typeof insightPeriods)[number]["value"];

/**
 * Jumlah sesi per hari, 52 minggu terakhir (Sen → Min). Minggu terakhir dimulai `lastWeekStart`.
 * 13 minggu terakhir = data di Figma (33 sesi); sebelumnya pola rutin weekend sehingga
 * total setahun = 72 sesi, sama dengan ring "Sesi mabar" di annualTargets.
 */
const RECENT_WEEKS = [
  "0000011",
  "0100012",
  "0001001",
  "0000021",
  "0010001",
  "0000111",
  "0000012",
  "0100001",
  "0000021",
  "0010012",
  "0000012",
  "0001001",
  "0000000",
];

const EARLIER_WEEKS = Array.from({ length: 39 }, (_, week) => {
  const saturday = [0, 1, 0, 0, 0, 0, 0][week % 7];
  const sunday = [1, 1, 0, 1, 1, 0, 1][week % 7];
  const weekday = week % 8 === 4 ? "00100" : "00000";
  return `${weekday}${saturday}${sunday}`;
});

export const activityHeatmap = {
  title: "Hari paling aktif",
  lastWeekStart: "2026-09-28",
  /** Sel lime = sesi berikutnya yang sudah dibooking. */
  nextSession: "2026-10-03",
  weeks: [...EARLIER_WEEKS, ...RECENT_WEEKS].map((week) => [...week].map(Number)),
};

/** Kartu insight di bawah grafik. "Hari favorit" dihitung dari heatmap. */
export const favorites = {
  time: "07.00 pagi",
  venue: "AYANA Midplaza",
};

/* ── Sesi member (Dashboard "Activity" + tab My Activities) ── */

export type MemberSessionStatus = "upcoming" | "registered" | "done";

export type MemberSession = {
  slug: string;
  title: string;
  venue: string;
  city: City;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  image: string;
  status: MemberSessionStatus;
  /** Slay Point yang didapat setelah hadir. */
  points?: number;
};

const HOME = "/images/home";

export const memberSessions: MemberSession[] = [
  {
    slug: "weekly-mabar-ayana-03-okt",
    title: "Mabar Session",
    venue: "AYANA Midplaza Jakarta",
    city: "Jakarta",
    date: "2026-10-03",
    start: "07:00",
    end: "11:00",
    image: `${HOME}/venue-ayana.webp`,
    status: "upcoming",
  },
  {
    slug: "mabar-di-bali-altitude-kintamani",
    title: "Mabar di Bali",
    venue: "Altitude Kintamani",
    city: "Bali",
    date: "2026-10-04",
    start: "07:00",
    end: "11:00",
    image: "/images/activity/featured-altitude.webp",
    status: "registered",
  },
  {
    slug: "weekly-mabar-maison-20-sep",
    title: "Weekly MABAR",
    venue: "Maison Playcourt",
    city: "Jakarta",
    date: "2026-09-20",
    start: "07:00",
    end: "11:00",
    image: `${HOME}/venue-maison.webp`,
    status: "done",
    points: 50,
  },
  {
    slug: "beginner-coaching-common-grounds-13-sep",
    title: "Beginner Coaching",
    venue: "Common Grounds Menteng",
    city: "Jakarta",
    date: "2026-09-13",
    start: "16:00",
    end: "18:00",
    image: `${HOME}/venue-common-grounds.webp`,
    status: "done",
    points: 50,
  },
  {
    slug: "match-day-raffles-06-sep",
    title: "Tennis Match Day",
    venue: "Raffles Hotel Jakarta",
    city: "Jakarta",
    date: "2026-09-06",
    start: "07:00",
    end: "10:00",
    image: `${HOME}/venue-raffles.webp`,
    status: "done",
    points: 50,
  },
];

export const sessionStatusLabel: Record<MemberSessionStatus, string> = {
  upcoming: "Upcoming",
  registered: "Terdaftar",
  done: "Selesai",
};

export const myActivitiesPage = {
  upcoming: { title: "Terbaru", subtitle: "Sesi yang akan kamu ikuti", empty: "Belum ada sesi terdaftar." },
  past: { title: "Lampau", subtitle: "Riwayat sesi yang sudah kamu ikuti", empty: "Belum ada riwayat sesi." },
};

/* ── Order ───────────────────────────────────────────────── */

export const orderPage = {
  title: "Order",
  selectAll: "Pilih semua",
  availability: "Tersedia · dikirim dalam 2–3 hari",
  summary: "Ringkasan",
  shipping: { label: "Ongkos kirim", value: "Dihitung saat checkout" },
  pointsCopy: "Slay Point dari pesanan ini",
  /** PRD: 1 Slay Point per Rp10.000 belanja. */
  rupiahPerPoint: 10000,
  checkout: { label: "Checkout", href: "/checkout" },
  continueShopping: { label: "Lanjut belanja", href: "/shop" },
  empty: {
    title: "Keranjang kamu masih kosong",
    body: "Merch Soslay edisi terbatas menunggu — pilih favoritmu dulu.",
  },
};

/* ── Profile ─────────────────────────────────────────────── */

export const cityOptions = [
  "Jakarta Selatan",
  "Jakarta Pusat",
  "Jakarta Barat",
  "Jakarta Timur",
  "Jakarta Utara",
  "Tangerang",
  "Bekasi",
  "Depok",
  "Bogor",
  "Bali",
];

export const genderOptions = ["Laki-laki", "Perempuan", "Tidak ingin menyebutkan"];

export const playingDurationOptions = ["Kurang dari 6 bulan", "6–12 bulan", "1–3 tahun", "3–5 tahun", "Lebih dari 5 tahun"];

export const tennisLevelOptions = [
  "Beginner",
  "Beginner–Intermediate",
  "Intermediate",
  "Intermediate–Advanced",
  "Advanced",
];

export const playingFrequencyOptions = ["First time / Rarely", "1–2x/month", "1x/week", "2–3x/week", "4x+/week"];

export const playingFormatOptions = ["Singles", "Doubles", "Both"];

export const handOptions = ["Right", "Left", "Both"];

export const lookingForOptions = [
  "Meet new people",
  "Improve my tennis",
  "Join tennis events",
  "Buy Merchandise",
  "Find tennis partners",
  "Buy & Sell tennis equipment",
  "Travel & play tennis",
  "Social & lifestyle experiences",
];

export const eventTypeOptions = [
  "Social Match",
  "Competitive Match",
  "Tennis Trip / Destination",
  "Tennis + Dining",
  "Tennis + Lifestyle",
  "Private / Intimate Gathering",
];

export type MemberProfile = {
  photo: string | null;
  fullName: string;
  displayName: string;
  birthDate: string; // YYYY-MM-DD
  gender: string;
  phone: string;
  city: string;
  kuyId: string;
  reclubId: string;
  instagram: string;
  email: string;
  tennisLevel: string;
  playingFrequency: string;
  playingFormat: string;
  hand: string;
  playingDuration: string;
  lookingFor: string[];
  eventTypes: string[];
};

export const memberProfile: MemberProfile = {
  photo: null,
  fullName: member.name,
  displayName: "Arya",
  birthDate: "1996-03-14",
  gender: "Laki-laki",
  phone: "812 3456 7890",
  city: "Jakarta Selatan",
  kuyId: member.username,
  reclubId: "",
  instagram: "aryaputradewangga",
  email: member.email,
  tennisLevel: "Intermediate",
  playingFrequency: "1x/week",
  playingFormat: "Doubles",
  hand: "Right",
  playingDuration: "1–3 tahun",
  lookingFor: ["Meet new people", "Improve my tennis", "Join tennis events", "Find tennis partners"],
  eventTypes: ["Social Match", "Tennis + Dining"],
};

export type ProfileField = keyof MemberProfile;

/** Section form profil + field yang dihitung untuk "Kelengkapan profil". */
export const profileSections = [
  {
    id: "basic-information",
    title: "Basic Information",
    subtitle: "Data diri yang dipakai untuk akun, booking, dan kartu member kamu.",
    fields: ["photo", "fullName", "displayName", "birthDate", "gender", "phone", "city", "kuyId", "reclubId", "instagram", "email"],
  },
  {
    id: "tennis-profile",
    title: "Tennis Profile",
    subtitle: "Bantu kami mencocokkan level dan format main kamu di setiap sesi.",
    fields: ["tennisLevel", "playingFrequency", "playingFormat", "hand", "playingDuration"],
  },
  {
    id: "community-preferences",
    title: "Community Preferences",
    subtitle: "Kami pakai ini untuk merekomendasikan event dan partner main yang cocok.",
    fields: ["lookingFor", "eventTypes"],
  },
] as const satisfies { id: string; title: string; subtitle: string; fields: ProfileField[] }[];

export const requiredProfileFields: ProfileField[] = [
  "fullName",
  "phone",
  "city",
  "kuyId",
  "instagram",
  "email",
  "tennisLevel",
];

export const profilePage = {
  summary: {
    title: "Profil kamu",
    subtitle: "Lengkapi profil supaya kami bisa mencocokkan kamu dengan partner & event yang pas.",
    completion: "Kelengkapan profil",
  },
  photoHint: "JPG atau PNG, maksimal 2 MB. Foto wajah terlihat jelas.",
  multiHint: "Boleh pilih lebih dari satu",
  requiredNote: "Kolom bertanda * wajib diisi",
  saved: "Perubahan tersimpan",
};
