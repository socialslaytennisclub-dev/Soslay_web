import "server-only";
import { activityTypes } from "@/content/activity";
import { describeVariant, productDetails, products } from "@/content/products";
import { venueList } from "@/content/venues";
import type { BookingStatus, MemberStatus, OrderStatus, PaymentStatus, TennisLevel, Tier } from "./types";

/**
 * Data demo deterministik dengan bentuk yang sama seperti tabel Supabase
 * (profiles, sessions, bookings, points_ledger, orders). Dipakai selama project Supabase
 * belum tersambung — angka & relasinya konsisten, jadi Overview/Members/Detail terasa nyata.
 */

// ── PRNG deterministik (mulberry32) ─────────────────────────────────────────
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2507);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const chance = (p: number) => rand() < p;

const DAY = 86_400_000;
/** Data dibangkitkan relatif terhadap tanggal tetap supaya angka stabil antar render. */
export const DEMO_NOW = new Date("2026-10-07T10:00:00+07:00");

const WIB = 7 * 3600_000;

/** Senin 00.00 WIB dari minggu yang memuat `date`. */
export function jakartaWeekStart(date: Date): Date {
  const local = date.getTime() + WIB;
  const dayIndex = Math.floor(local / DAY);
  const weekday = (new Date(dayIndex * DAY).getUTCDay() + 6) % 7; // Senin = 0
  return new Date((dayIndex - weekday) * DAY - WIB);
}

// ── Tabel referensi ─────────────────────────────────────────────────────────
export const TIERS: { tier: Tier; label: string; minPoints: number }[] = [
  { tier: "basic", label: "Basic", minPoints: 0 },
  { tier: "silver", label: "Silver", minPoints: 500 },
  { tier: "gold", label: "Gold", minPoints: 2000 },
  { tier: "platinum", label: "Platinum", minPoints: 3000 },
];


const FIRST = ["Arya", "Nadia", "Kevin", "Maya", "Dimas", "Anitya", "Yudi", "Sinta", "Vika", "Lily", "Raka", "Putri", "Bima", "Laras", "Fajar", "Citra", "Rizky", "Ayu", "Gilang", "Nabila", "Dewa", "Salsa", "Andre", "Kirana", "Bagas", "Tiara", "Reza", "Amelia", "Farhan", "Intan", "Hendra", "Melati", "Yoga", "Clara", "Aldi", "Rania", "Satria", "Dinda", "Kevin", "Jessica"];
const LAST = ["Putra", "Salsabila", "Wijaya", "Rahmadani", "Fadhil", "Silfia", "Sadewa", "Kusuma", "Yusti", "Anggraini", "Pratama", "Saraswati", "Oktaviani", "Hermawan", "Nugroho", "Lestari", "Santoso", "Halim", "Gunawan", "Permata", "Hakim", "Utami", "Tanjung", "Setiawan", "Kurniawan", "Maharani", "Siregar", "Pangestu"];
const CITIES = ["Jakarta Selatan", "Jakarta Selatan", "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Utara", "Jakarta Timur", "Tangerang", "Depok", "Bekasi", "Bandung", "Denpasar", "Badung"];
const LEVELS: TennisLevel[] = ["beginner", "beginner", "beginner_intermediate", "beginner_intermediate", "intermediate", "intermediate", "intermediate", "intermediate_advanced", "advanced"];
const FREQUENCIES = ["First time / Rarely", "1–2x/month", "1x/week", "2–3x/week", "4x+/week"];
const LOOKING_FOR = ["Meet new people", "Improve my tennis", "Join tennis events", "Buy Merchandise", "Find tennis partners", "Travel & play tennis", "Social & lifestyle experiences"];
const EVENT_TYPES = ["Social Match", "Competitive Match", "Tennis Trip / Destination", "Tennis + Dining", "Tennis + Lifestyle", "Private / Intimate Gathering"];

// ── Member ──────────────────────────────────────────────────────────────────
export type DemoMember = {
  id: string;
  seq: number;
  fullName: string;
  email: string;
  phone: string;
  kuyId: string;
  instagram: string;
  city: string;
  level: TennisLevel;
  joinedAt: Date;
  birthDate: string;
  gender: "male" | "female" | "undisclosed";
  playFrequency: string;
  playFormat: string;
  hand: string;
  playingSince: string;
  lookingFor: string[];
  eventTypes: string[];
  /** Peluang ikut sesi per minggu — beda-beda tiap member (ada yang rajin, ada yang jarang). */
  activity: number;
  suspended: boolean;
};

const MEMBER_COUNT = 540;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export const members: DemoMember[] = Array.from({ length: MEMBER_COUNT }, (_, i) => {
  // Member pertama = contoh di Figma (Arya Putra Dewangga, Gold, gabung Juli 2025).
  const isArya = i === 0;
  const first = isArya ? "Arya" : pick(FIRST);
  const last = isArya ? "Putra Dewangga" : pick(LAST);
  const fullName = `${first} ${last}`;
  const handle = isArya ? "aryasoslay67" : `${slug(first)}${slug(last).slice(0, 4)}${between(1, 99)}`;
  // Pertumbuhan: lebih banyak member baru belakangan (2024-06 → sekarang).
  const start = new Date("2024-06-01").getTime();
  const span = DEMO_NOW.getTime() - start;
  const joinedAt = isArya ? new Date("2025-07-12T09:00:00+07:00") : new Date(start + Math.pow(rand(), 0.7) * span);
  const sex = chance(0.52) ? "female" : "male";
  return {
    id: `m${String(i + 1).padStart(4, "0")}`,
    seq: i + 1,
    fullName,
    email: isArya ? "aryaputradewangga@gmail.com" : `${slug(first)}.${slug(last)}${between(1, 9)}@mail.com`,
    phone: `81${between(1, 9)}${between(1000, 9999)}${between(1000, 9999)}`,
    kuyId: handle,
    instagram: handle,
    city: isArya ? "Jakarta Selatan" : pick(CITIES),
    level: isArya ? "intermediate" : pick(LEVELS),
    joinedAt,
    birthDate: `19${between(85, 99)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
    gender: isArya ? "male" : chance(0.03) ? "undisclosed" : sex,
    playFrequency: isArya ? "1x/week" : pick(FREQUENCIES),
    playFormat: pick(["Singles", "Doubles", "Doubles", "Both"]),
    hand: chance(0.88) ? "Right" : "Left",
    playingSince: pick(["Kurang dari 6 bulan", "6–12 bulan", "1–3 tahun", "1–3 tahun", "3–5 tahun", "Lebih dari 5 tahun"]),
    lookingFor: isArya ? ["Meet new people", "Improve my tennis", "Join tennis events", "Find tennis partners"] : LOOKING_FOR.filter(() => chance(0.35)),
    eventTypes: isArya ? ["Social Match", "Tennis + Dining"] : EVENT_TYPES.filter(() => chance(0.3)),
    activity: isArya ? 0.84 : Math.pow(rand(), 0.9),
    suspended: !isArya && chance(0.004),
  };
});

export function memberCode(m: DemoMember): string {
  const wib = new Date(m.joinedAt.getTime() + WIB);
  const yymm = `${String(wib.getUTCFullYear()).slice(2)}${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
  return `SOS ${String(m.seq).padStart(4, "0")} ${yymm}`;
}

// ── Sesi & booking ──────────────────────────────────────────────────────────
export type SessionStatus = "draft" | "published" | "cancelled" | "completed";

export type DemoSession = {
  id: string;
  title: string;
  typeSlug: string;
  description: string;
  venueName: string;
  court: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  price: number;
  pointsPerAttendance: number;
  status: SessionStatus;
  /** Published tapi baru tampil di website mulai tanggal ini → "Terjadwal". */
  publishAt: Date | null;
  visibility: "public" | "members" | "link";
  waitlistEnabled: boolean;
  membersOnly: boolean;
  showOnHomepage: boolean;
  recommendedLevels: TennisLevel[];
  repeatWeekly: boolean;
};

export type DemoBooking = {
  sessionId: string;
  memberId: string;
  status: BookingStatus;
  payment: PaymentStatus;
  createdAt: Date;
};

const SESSION_TEMPLATES = [
  { title: "Weekly MABAR", typeSlug: "weekly-mabar", day: 0, hour: 7, hours: 3, capacity: 24 },
  { title: "Mabar Session", typeSlug: "weekly-mabar", day: 6, hour: 7, hours: 4, capacity: 24 },
  { title: "Weekly MABAR", typeSlug: "weekly-mabar", day: 0, hour: 16, hours: 3, capacity: 24 },
  { title: "Beginner Coaching", typeSlug: "beginner-coaching", day: 3, hour: 18, hours: 2, capacity: 12 },
  { title: "Tennis Match Day", typeSlug: "match-day", day: 6, hour: 8, hours: 4, capacity: 32 },
  { title: "Social Rally", typeSlug: "social", day: 5, hour: 19, hours: 2, capacity: 16 },
  { title: "Night Mabar", typeSlug: "weekly-mabar", day: 2, hour: 19, hours: 2, capacity: 16 },
];
const JAKARTA_VENUES = venueList.filter((v) => v.city === "Jakarta").map((v) => v.name);
const BALI_VENUES = ["Altitude Kintamani", ...venueList.filter((v) => v.city === "Bali").map((v) => v.name)];

export const sessions: DemoSession[] = [];
export const bookings: DemoBooking[] = [];

// 52 minggu ke belakang + 2 minggu ke depan
// Semua jam dihitung dalam WIB (UTC+7, tanpa DST) — tidak bergantung zona waktu server.
const firstMonday = new Date(jakartaWeekStart(DEMO_NOW).getTime() - 52 * 7 * DAY);

const PRICE: Record<string, number> = { "weekly-mabar": 150_000, "beginner-coaching": 250_000, "match-day": 200_000, "tennis-escape": 350_000, social: 150_000 };
const DESCRIPTION: Record<string, string> = {
  "weekly-mabar": "Mabar santai tiap minggu. Main doubles bergantian, ketemu orang baru, dan dapat foto profesional dari fotografer Soslay.",
  "beginner-coaching": "Sesi latihan dasar bersama coach: grip, forehand, backhand, dan servis. Cocok untuk yang baru mulai.",
  "match-day": "Format turnamen santai — round robin doubles dengan papan skor. Pemenang dapat merch Soslay.",
  "tennis-escape": "Main tenis di lapangan tropis Bali, lanjut brunch bareng. Termasuk fotografer & transport lokal.",
  social: "Rally ringan lalu nongkrong bareng komunitas. Datang sendiri pun pasti dapat teman main.",
};
const LEVELS_FOR: Record<string, TennisLevel[]> = {
  "weekly-mabar": ["beginner_intermediate", "intermediate"],
  "beginner-coaching": ["beginner"],
  "match-day": ["intermediate", "intermediate_advanced", "advanced"],
  "tennis-escape": ["beginner_intermediate", "intermediate", "intermediate_advanced"],
  social: ["beginner", "beginner_intermediate", "intermediate"],
};

// 52 minggu ke belakang + 5 minggu ke depan (jadwal ±1 bulan sudah dibuka)
for (let week = 0; week < 58; week++) {
  const monday = firstMonday.getTime() + week * 7 * DAY;
  // Komunitas tumbuh → makin banyak sesi per minggu belakangan.
  const templates = SESSION_TEMPLATES.filter((_, i) => i < 4 + Math.floor((week / 54) * 3) || chance(0.35));
  const escape = week % 4 === 3; // Tennis Escape Bali tiap ±4 minggu
  const list = escape ? [...templates, { title: "Mabar di Bali", typeSlug: "tennis-escape", day: 6, hour: 7, hours: 4, capacity: 20 }] : templates;

  list.forEach((tpl, i) => {
    const startsAt = new Date(monday + ((tpl.day + 6) % 7) * DAY + tpl.hour * 3600_000);
    const session: DemoSession = {
      id: `s${week}-${i}`,
      title: tpl.title,
      typeSlug: tpl.typeSlug,
      description: DESCRIPTION[tpl.typeSlug],
      venueName: tpl.typeSlug === "tennis-escape" ? pick(BALI_VENUES) : pick(JAKARTA_VENUES),
      court: pick(["Court 1", "Court 2", "Court 2 & 3", "Center court"]),
      startsAt,
      endsAt: new Date(startsAt.getTime() + tpl.hours * 3600_000),
      capacity: tpl.capacity,
      price: PRICE[tpl.typeSlug],
      status: "published",
      publishAt: null,
      visibility: "public",
      waitlistEnabled: true,
      membersOnly: false,
      showOnHomepage: false,
      recommendedLevels: LEVELS_FOR[tpl.typeSlug],
      repeatWeekly: tpl.typeSlug === "weekly-mabar",
      // "Slay Point per hadir" diatur per sesi di editor; event spesial memberi lebih banyak.
      pointsPerAttendance: tpl.typeSlug === "tennis-escape" ? 150 : tpl.typeSlug === "match-day" ? 100 : 50,
    };
    sessions.push(session);

    const past = startsAt < DEMO_NOW;
    const weeksAhead = (startsAt.getTime() - DEMO_NOW.getTime()) / (7 * DAY);
    if (past) {
      session.status = chance(0.03) ? "cancelled" : "completed";
    } else if (weeksAhead > 3 && chance(0.4)) {
      session.status = "draft"; // jadwal jauh masih disusun
    } else if (weeksAhead > 2 && chance(0.4)) {
      session.publishAt = new Date(startsAt.getTime() - 14 * DAY); // dibuka 2 minggu sebelum sesi
    }
    if (session.status === "draft" || session.status === "cancelled") return;
    const eligible = members.filter((m) => m.joinedAt < startsAt && !m.suspended);
    // Isi sesi 55–100%. Member dipilih berbobot keaktifan (activity³): yang rajin jauh lebih
    // sering ikut — menghasilkan sebaran tier yang wajar (banyak Basic, sedikit Platinum).
    // Sesi dekat lebih penuh; sebagian sudah penuh + waitlist.
    const full = !past && weeksAhead < 2 && chance(0.3);
    const target = full ? tpl.capacity : Math.round(tpl.capacity * (past ? 0.55 + rand() * 0.45 : Math.max(0.05, 0.9 - weeksAhead * 0.18) * (0.6 + rand() * 0.4)));
    const weights = eligible.map((m) => m.activity ** 4);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const chosen = new Set<DemoMember>();
    if (session.title === "Mabar Session" && !past) chosen.add(members[0]); // Arya ikut sesi mendatang
    for (let tries = 0; chosen.size < target && tries < target * 20 && totalWeight > 0; tries++) {
      let r = rand() * totalWeight;
      const index = weights.findIndex((w) => (r -= w) <= 0);
      chosen.add(eligible[index === -1 ? eligible.length - 1 : index]);
    }
    for (const m of chosen) {
      const status: BookingStatus = past ? (chance(0.06) ? "no_show" : "attended") : "registered";
      bookings.push({
        sessionId: session.id,
        memberId: m.id,
        status,
        payment: past ? "paid" : chance(0.85) ? "paid" : "pending",
        // Booking dibuat 1–12 hari sebelum sesi, tidak pernah di masa depan.
        createdAt: new Date(Math.min(startsAt.getTime() - between(1, 12) * DAY, DEMO_NOW.getTime() - between(1, 48) * 3600_000)),
      });
    }
    if (full) {
      const waiting = eligible.filter((m) => !chosen.has(m)).sort(() => rand() - 0.5).slice(0, between(1, 8));
      for (const m of waiting) {
        bookings.push({ sessionId: session.id, memberId: m.id, status: "waitlisted", payment: "pending", createdAt: new Date(DEMO_NOW.getTime() - between(1, 72) * 3600_000) });
      }
    }
  });
}

// ── Order shop ──────────────────────────────────────────────────────────────
export type DemoOrder = {
  code: string;
  memberId: string;
  items: { productSlug: string; name: string; variant: string; price: number; quantity: number }[];
  total: number;
  payment: PaymentStatus;
  status: OrderStatus;
  placedAt: Date;
};

export const orders: DemoOrder[] = [];
const buyers = members.filter((m) => m.activity > 0.2);
for (let n = 0; n < 340; n++) {
  const placedAt = new Date(DEMO_NOW.getTime() - rand() * 200 * DAY);
  const product = pick(products.filter((p) => p.stock > 0 || chance(0.2)));
  const options = productDetails[product.slug]?.options ?? [];
  const selection = Object.fromEntries(options.map((group) => [group.key, pick(group.values).value]));
  const variant = describeVariant(product.slug, selection);
  const quantity = chance(0.85) ? 1 : 2;
  const ageDays = (DEMO_NOW.getTime() - placedAt.getTime()) / DAY;
  const status: OrderStatus = ageDays < 1.5 ? "processing" : ageDays < 4 ? "shipped" : chance(0.05) ? "cancelled" : "completed";
  const payment: PaymentStatus = status === "cancelled" ? "failed" : ageDays < 0.5 && chance(0.4) ? "pending" : "paid";
  orders.push({
    code: `SOS-${2000 + n}`,
    memberId: (n === 339 ? members[0] : pick(buyers)).id,
    items: [
      {
        productSlug: product.slug,
        name: product.name,
        variant: [variant.color?.label, ...variant.chips].filter(Boolean).join(", "),
        price: product.price,
        quantity,
      },
    ],
    total: product.price * quantity,
    payment,
    status,
    placedAt,
  });
}
orders.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
orders.forEach((order, i) => (order.code = `SOS-${2309 - i}`));

// ── Index & turunan (setara VIEW member_stats) ──────────────────────────────
export const sessionById = new Map(sessions.map((s) => [s.id, s]));
export const memberById = new Map(members.map((m) => [m.id, m]));

export type DemoMemberStats = {
  sessionsAttended: number;
  noShows: number;
  hoursPlayed: number;
  lastPlayedAt: Date | null;
  pointsEarned: number;
  pointsBalance: number;
  totalSpent: number;
  tier: Tier;
  status: MemberStatus;
};

const statsCache = new Map<string, DemoMemberStats>();

export function memberStats(id: string): DemoMemberStats {
  const cached = statsCache.get(id);
  if (cached) return cached;
  const member = memberById.get(id)!;
  let sessionsAttended = 0;
  let noShows = 0;
  let hoursPlayed = 0;
  let lastPlayedAt: Date | null = null;
  let pointsEarned = 0;
  for (const b of bookingsByMember.get(id) ?? []) {
    const s = sessionById.get(b.sessionId)!;
    if (b.status === "attended") {
      sessionsAttended++;
      hoursPlayed += (s.endsAt.getTime() - s.startsAt.getTime()) / 3600_000;
      pointsEarned += s.pointsPerAttendance;
      if (!lastPlayedAt || s.startsAt > lastPlayedAt) lastPlayedAt = s.startsAt;
    }
    if (b.status === "no_show") noShows++;
  }
  const paidOrders = (ordersByMember.get(id) ?? []).filter((o) => o.payment === "paid");
  const totalSpent = paidOrders.reduce((sum, o) => sum + o.total, 0);
  pointsEarned += paidOrders.reduce((sum, o) => sum + Math.floor(o.total / 10_000), 0);
  // Penukaran poin (redeem) mengurangi saldo, bukan tier.
  const pointsBalance = Math.max(0, pointsEarned - (pointsEarned > 900 ? Math.round(pointsEarned * 0.12) : 0));
  const tier = [...TIERS].reverse().find((t) => pointsEarned >= t.minPoints)!.tier;
  const inactive = !lastPlayedAt || DEMO_NOW.getTime() - lastPlayedAt.getTime() > 60 * DAY;
  const isNew = DEMO_NOW.getTime() - member.joinedAt.getTime() < 30 * DAY;
  const status: MemberStatus = member.suspended ? "suspended" : inactive && !isNew ? "inactive" : "active";
  const result = { sessionsAttended, noShows, hoursPlayed, lastPlayedAt, pointsEarned, pointsBalance, totalSpent, tier, status };
  statsCache.set(id, result);
  return result;
}

const bookingsByMember = new Map<string, DemoBooking[]>();
for (const b of bookings) {
  const list = bookingsByMember.get(b.memberId) ?? [];
  list.push(b);
  bookingsByMember.set(b.memberId, list);
}
const ordersByMember = new Map<string, DemoOrder[]>();
for (const o of orders) {
  const list = ordersByMember.get(o.memberId) ?? [];
  list.push(o);
  ordersByMember.set(o.memberId, list);
}

export function bookingsOf(memberId: string): DemoBooking[] {
  return bookingsByMember.get(memberId) ?? [];
}

export function ordersOf(memberId: string): DemoOrder[] {
  return ordersByMember.get(memberId) ?? [];
}

export const activityTypeLabels = Object.fromEntries(activityTypes.map((t) => [t.slug, t.label]));
