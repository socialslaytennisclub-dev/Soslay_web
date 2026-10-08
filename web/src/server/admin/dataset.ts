import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { products as catalog } from "@/content/products";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as demo from "./demo-data";
import type { BookingStatus, MemberStatus, OrderStatus, PaymentStatus, TennisLevel, Tier } from "./types";

/**
 * Satu sumber data untuk semua repo admin. Mode demo → ./demo-data. Mode live → tabel
 * Supabase dimuat sekali per request (React cache) memakai sesi admin, jadi RLS tetap berlaku.
 *
 * Skala Soslay (±500–1.500 member, puluhan ribu booking per tahun) masih nyaman dimuat
 * utuh lalu diagregasi di server. Kalau tumbuh jauh di atas itu, pindahkan agregasi ke
 * view/RPC Postgres — tanda tangan repo tidak berubah.
 */

import { DAY } from "./time";

export type DataMember = demo.DemoMember & { memberCode: string; tier?: Tier; status?: MemberStatus };
export type DataSession = demo.DemoSession & {
  kuyUrl?: string | null;
  crew?: { name: string; role: "Host" | "Coach" | "Fotografer" }[];
  courts?: string[];
};
export type DataBooking = demo.DemoBooking & { source?: "website" | "kuy" | "admin"; guests?: number; checkedIn?: boolean };
export type DataOrder = demo.DemoOrder & {
  detail?: {
    paymentMethod: string | null;
    channel: string;
    subtotal: number;
    shippingFee: number;
    discount: number;
    grandTotal: number;
    address: string;
    courier: string | null;
    trackingNumber: string | null;
  };
};
export type MemberStats = demo.DemoMemberStats;

export type Dataset = {
  live: boolean;
  now: Date;
  members: DataMember[];
  sessions: DataSession[];
  bookings: DataBooking[];
  orders: DataOrder[];
  memberById: Map<string, DataMember>;
  sessionById: Map<string, DataSession>;
  bookingsOf: (memberId: string) => DataBooking[];
  bookingsOfSession: (sessionId: string) => DataBooking[];
  ordersOf: (memberId: string) => DataOrder[];
  stats: (memberId: string) => MemberStats;
  /** Stok per produk (slug) — live dari product_variants; demo dari src/content/products. */
  productStock?: Map<string, number>;
  /** Venue live: jumlah lapangan & tampil/tidak. */
  venueMeta?: Map<string, { courts: number; active: boolean }>;
};

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function index(members: DataMember[], sessions: DataSession[], bookings: DataBooking[], orders: DataOrder[]) {
  const bookingsByMember = groupBy(bookings, (b) => b.memberId);
  const bookingsBySession = groupBy(bookings, (b) => b.sessionId);
  const ordersByMember = groupBy(orders, (o) => o.memberId);
  return {
    memberById: new Map(members.map((m) => [m.id, m])),
    sessionById: new Map(sessions.map((s) => [s.id, s])),
    bookingsByMember,
    ordersByMember,
    bookingsOf: (id: string) => bookingsByMember.get(id) ?? [],
    bookingsOfSession: (id: string) => bookingsBySession.get(id) ?? [],
    ordersOf: (id: string) => ordersByMember.get(id) ?? [],
  };
}

// ── Demo ────────────────────────────────────────────────────────────────────
function buildDemoDataset(): Dataset {
  const members = demo.members.map((m) => ({ ...m, memberCode: demo.memberCode(m) }));
  const { memberById, sessionById, bookingsOf, bookingsOfSession, ordersOf } = index(members, demo.sessions, demo.bookings, demo.orders);
  return {
    live: false,
    now: demo.DEMO_NOW,
    members,
    sessions: demo.sessions,
    bookings: demo.bookings,
    orders: demo.orders,
    memberById,
    sessionById,
    bookingsOf,
    bookingsOfSession,
    ordersOf,
    stats: demo.memberStats,
  };
}
let demoDataset: Dataset | undefined;

// ── Live (Supabase) ─────────────────────────────────────────────────────────
/** PostgREST membatasi 1.000 baris per request → ambil bertahap. */
async function fetchAll<T>(client: SupabaseClient, table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw new Error(`Gagal memuat ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

const slugByProductName = new Map(catalog.map((p) => [p.name, p.slug]));

// Enum database → label yang dipakai UI (sama dengan data demo).
const FREQUENCY: Record<string, string> = { rarely: "First time / Rarely", monthly: "1–2x/month", weekly: "1x/week", twice_weekly: "2–3x/week", often: "4x+/week" };
const FORMAT: Record<string, string> = { singles: "Singles", doubles: "Doubles", both: "Both" };
const HAND: Record<string, string> = { right: "Right", left: "Left", both: "Both" };
const CREW: Record<string, "Host" | "Coach" | "Fotografer"> = { host: "Host", coach: "Coach", photographer: "Fotografer" };

type ProfileRow = {
  id: string; member_code: string; full_name: string; email: string; phone: string | null; city: string | null; birth_date: string | null;
  gender: string | null; kuy_id: string | null; instagram: string | null; tier: Tier; status: MemberStatus; tennis_level: TennisLevel | null;
  play_frequency: string | null; play_format: string | null; dominant_hand: string | null; playing_since: string | null;
  looking_for: string[]; event_types: string[]; joined_at: string;
};
type StatsRow = { member_id: string; points_balance: number; points_earned: number; total_spent: number };
type SessionRow = {
  id: string; title: string; type_slug: string; description: string | null; court_label: string | null; starts_at: string; ends_at: string;
  capacity: number; price: number; points_per_attendance: number; status: demo.SessionStatus; publish_at: string | null;
  visibility: "public" | "members" | "link"; waitlist_enabled: boolean; members_only: boolean; show_on_homepage: boolean;
  recommended_levels: TennisLevel[]; series_id: string | null; kuy_booking_url: string | null;
  venues: { name: string; courts: string[] } | null;
  session_crew: { role: string; staff_members: { full_name: string } | null }[];
};
type BookingRow = { session_id: string; member_id: string; status: BookingStatus; payment_status: PaymentStatus; source: "website" | "kuy" | "admin"; guests: number; checked_in_at: string | null; created_at: string };
type OrderRowDb = {
  code: string; member_id: string | null; status: OrderStatus; payment_status: PaymentStatus; payment_method: string | null; channel: string;
  subtotal: number; shipping_fee: number; discount: number; total: number; shipping_address: string; courier: string | null; tracking_number: string | null;
  placed_at: string; order_items: { product_name: string; options: { label?: string } & Record<string, string>; unit_price: number; quantity: number }[];
};

async function loadLive(): Promise<Dataset> {
  const client = await createSupabaseServerClient();
  const now = new Date();

  const [profiles, statsRows, sessionRows, bookingRows, orderRows, productRows, venueRows] = await Promise.all([
    fetchAll<ProfileRow>(client, "profiles", "*", "joined_at"),
    fetchAll<StatsRow>(client, "member_stats", "member_id, points_balance, points_earned, total_spent", "member_id"),
    fetchAll<SessionRow>(
      client,
      "sessions",
      "id, title, type_slug, description, court_label, starts_at, ends_at, capacity, price, points_per_attendance, status, publish_at, visibility, waitlist_enabled, members_only, show_on_homepage, recommended_levels, series_id, kuy_booking_url, venues(name, courts), session_crew(role, staff_members(full_name))",
      "starts_at",
    ),
    fetchAll<BookingRow>(client, "bookings", "session_id, member_id, status, payment_status, source, guests, checked_in_at, created_at", "created_at"),
    fetchAll<OrderRowDb>(
      client,
      "orders",
      "code, member_id, status, payment_status, payment_method, channel, subtotal, shipping_fee, discount, total, shipping_address, courier, tracking_number, placed_at, order_items(product_name, options, unit_price, quantity)",
      "placed_at",
    ),
    fetchAll<{ slug: string; status: string; product_variants: { stock: number }[] }>(client, "products", "slug, status, product_variants(stock)", "sort_order"),
    fetchAll<{ name: string; courts: string[]; is_active: boolean }>(client, "venues", "name, courts, is_active", "sort_order"),
  ]);

  const members: DataMember[] = profiles.map((p, i) => ({
    id: p.id,
    seq: i + 1,
    memberCode: p.member_code,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone ?? "",
    kuyId: p.kuy_id ?? "",
    instagram: p.instagram ?? "",
    city: p.city ?? "",
    level: p.tennis_level ?? "beginner",
    joinedAt: new Date(p.joined_at),
    birthDate: p.birth_date ?? "",
    gender: (p.gender as demo.DemoMember["gender"]) ?? "undisclosed",
    playFrequency: FREQUENCY[p.play_frequency ?? ""] ?? "",
    playFormat: FORMAT[p.play_format ?? ""] ?? "",
    hand: HAND[p.dominant_hand ?? ""] ?? "",
    playingSince: p.playing_since ?? "",
    lookingFor: p.looking_for ?? [],
    eventTypes: p.event_types ?? [],
    activity: 0,
    suspended: p.status === "suspended",
    tier: p.tier,
    status: p.status,
  }));

  const sessions: DataSession[] = sessionRows.map((s) => ({
    id: s.id,
    title: s.title,
    typeSlug: s.type_slug,
    description: s.description ?? "",
    venueName: s.venues?.name ?? "—",
    court: s.court_label ?? "",
    courts: s.venues?.courts ?? [],
    startsAt: new Date(s.starts_at),
    endsAt: new Date(s.ends_at),
    capacity: s.capacity,
    price: s.price,
    pointsPerAttendance: s.points_per_attendance,
    status: s.status,
    publishAt: s.publish_at ? new Date(s.publish_at) : null,
    visibility: s.visibility,
    waitlistEnabled: s.waitlist_enabled,
    membersOnly: s.members_only,
    showOnHomepage: s.show_on_homepage,
    recommendedLevels: s.recommended_levels ?? [],
    repeatWeekly: Boolean(s.series_id),
    kuyUrl: s.kuy_booking_url,
    crew: s.session_crew.filter((c) => c.staff_members).map((c) => ({ name: c.staff_members!.full_name, role: CREW[c.role] ?? "Host" })),
  }));

  const bookings: DataBooking[] = bookingRows.map((b) => ({
    sessionId: b.session_id,
    memberId: b.member_id,
    status: b.status,
    payment: b.payment_status,
    createdAt: new Date(b.created_at),
    source: b.source,
    guests: b.guests,
    checkedIn: Boolean(b.checked_in_at),
  }));

  const orders: DataOrder[] = orderRows
    .filter((o) => o.member_id)
    .map((o) => ({
      code: o.code,
      memberId: o.member_id!,
      items: o.order_items.map((it) => ({
        productSlug: slugByProductName.get(it.product_name) ?? "",
        name: it.product_name,
        variant: it.options?.label ?? Object.values(it.options ?? {}).join(", "),
        price: it.unit_price,
        quantity: it.quantity,
      })),
      // `total` di UI lama = nilai produk; ongkir & diskon ada di `detail`.
      total: o.subtotal,
      payment: o.payment_status,
      status: o.status,
      placedAt: new Date(o.placed_at),
      detail: {
        paymentMethod: o.payment_method,
        channel: o.channel,
        subtotal: o.subtotal,
        shippingFee: o.shipping_fee,
        discount: o.discount,
        grandTotal: o.total,
        address: o.shipping_address,
        courier: o.courier,
        trackingNumber: o.tracking_number,
      },
    }))
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());

  const { memberById, sessionById, bookingsByMember, bookingsOf, bookingsOfSession, ordersOf } = index(members, sessions, bookings, orders);
  const statsById = new Map(statsRows.map((s) => [s.member_id, s]));
  const statsCache = new Map<string, MemberStats>();

  const stats = (id: string): MemberStats => {
    const cached = statsCache.get(id);
    if (cached) return cached;
    const member = memberById.get(id);
    let sessionsAttended = 0;
    let noShows = 0;
    let hoursPlayed = 0;
    let lastPlayedAt: Date | null = null;
    for (const b of bookingsByMember.get(id) ?? []) {
      const s = sessionById.get(b.sessionId);
      if (!s) continue;
      if (b.status === "attended") {
        sessionsAttended++;
        hoursPlayed += (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
        if (!lastPlayedAt || s.startsAt > lastPlayedAt) lastPlayedAt = s.startsAt;
      }
      if (b.status === "no_show") noShows++;
    }
    const row = statsById.get(id);
    // "Tidak aktif" = belum main 60 hari (kecuali member baru) — diturunkan, tidak disimpan.
    const inactive = !lastPlayedAt || now.getTime() - lastPlayedAt.getTime() > 60 * DAY;
    const isNew = member ? now.getTime() - member.joinedAt.getTime() < 30 * DAY : false;
    const status: MemberStatus = member?.status === "suspended" ? "suspended" : inactive && !isNew ? "inactive" : "active";
    const result: MemberStats = {
      sessionsAttended,
      noShows,
      hoursPlayed,
      lastPlayedAt,
      pointsEarned: Number(row?.points_earned ?? 0),
      pointsBalance: Number(row?.points_balance ?? 0),
      totalSpent: Number(row?.total_spent ?? 0),
      tier: member?.tier ?? "basic",
      status,
    };
    statsCache.set(id, result);
    return result;
  };

  return {
    live: true,
    now,
    members,
    sessions,
    bookings,
    orders,
    memberById,
    sessionById,
    bookingsOf,
    bookingsOfSession,
    ordersOf,
    stats,
    productStock: new Map(productRows.map((p) => [p.slug, p.product_variants.reduce((sum, v) => sum + v.stock, 0)])),
    venueMeta: new Map(venueRows.map((v) => [v.name, { courts: v.courts.length, active: v.is_active }])),
  };
}

/** Data admin untuk request ini (demo atau Supabase). */
export const getDataset = cache(async (): Promise<Dataset> => (isSupabaseConfigured ? loadLive() : (demoDataset ??= buildDemoDataset())));

/** "Sekarang" versi admin tanpa memuat data: tanggal demo, atau jam asli saat live. */
export const adminNow = () => (isSupabaseConfigured ? new Date() : demo.DEMO_NOW);
