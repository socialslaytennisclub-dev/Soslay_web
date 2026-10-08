import "server-only";
import { findProduct } from "@/content/products";
import { LEVEL_LABEL } from "@/lib/admin-labels";
import { getDataset, type DataMember, type Dataset } from "./dataset";
import { jakartaWeekStart, TIERS } from "./demo-data";
import { DAY, pctDelta } from "./time";
import type {
  MemberDetail,
  MemberListItem,
  MembersQuery,
  MembersResult,
  MemberTimelineItem,
  OverviewData,
  Segment,
  TennisLevel,
} from "./types";

/**
 * Akses data admin Members & Overview. Sumber data = getDataset(): Supabase kalau env diisi,
 * data demo kalau belum — halaman admin tidak perlu tahu bedanya.
 */

export const MEMBERS_PAGE_SIZE = 10;

function toListItem(d: Dataset, m: DataMember): MemberListItem {
  const stats = d.stats(m.id);
  return {
    id: m.id,
    memberCode: m.memberCode,
    fullName: m.fullName,
    email: m.email,
    kuyId: m.kuyId,
    instagram: m.instagram,
    city: m.city,
    level: m.level,
    tier: stats.tier,
    status: stats.status,
    joinedAt: m.joinedAt.toISOString(),
    sessionsAttended: stats.sessionsAttended,
    pointsBalance: stats.pointsBalance,
    lastPlayedAt: stats.lastPlayedAt?.toISOString() ?? null,
    lookingFor: m.lookingFor,
    eventTypes: m.eventTypes,
    playFrequency: m.playFrequency,
  };
}

const allMembers = (d: Dataset) => d.members.map((m) => toListItem(d, m));

function isNew(m: MemberListItem, now: Date) {
  return now.getTime() - new Date(m.joinedAt).getTime() < 30 * DAY;
}

function matchesTab(m: MemberListItem, tab: MembersQuery["tab"], now: Date) {
  if (tab === "active") return m.status === "active";
  if (tab === "new") return isNew(m, now);
  if (tab === "inactive") return m.status === "inactive";
  return true;
}

function applyFilters(list: MemberListItem[], query: MembersQuery, now: Date) {
  const q = query.q?.trim().toLowerCase();
  return list.filter(
    (m) =>
      matchesTab(m, query.tab, now) &&
      (!q || [m.fullName, m.email, m.kuyId, m.instagram, m.memberCode].some((v) => v.toLowerCase().includes(q))) &&
      (!query.tier || m.tier === query.tier) &&
      (!query.level || m.level === query.level) &&
      (!query.city || m.city.startsWith(query.city)) &&
      (!query.frequency || m.playFrequency === query.frequency) &&
      (!query.interest || m.lookingFor.includes(query.interest) || m.eventTypes.includes(query.interest)),
  );
}

function sortMembers(list: MemberListItem[], sort: MembersQuery["sort"] = "last_played", dir: MembersQuery["dir"] = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const key = (m: MemberListItem): string | number =>
    sort === "name" ? m.fullName : sort === "points" ? m.pointsBalance : sort === "joined" ? m.joinedAt : m.lastPlayedAt ?? "";
  return [...list].sort((a, b) => (key(a) > key(b) ? sign : key(a) < key(b) ? -sign : 0));
}

// ── Members ─────────────────────────────────────────────────────────────────
export async function listMembers(query: MembersQuery): Promise<MembersResult> {
  const d = await getDataset();
  const everyone = allMembers(d);
  const filtered = sortMembers(applyFilters(everyone, query, d.now), query.sort, query.dir);
  const pageCount = Math.max(1, Math.ceil(filtered.length / MEMBERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  return {
    items: filtered.slice((page - 1) * MEMBERS_PAGE_SIZE, page * MEMBERS_PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
    pageCount,
    counts: {
      all: everyone.length,
      active: everyone.filter((m) => m.status === "active").length,
      new: everyone.filter((m) => isNew(m, d.now)).length,
      inactive: everyone.filter((m) => m.status === "inactive").length,
    },
    cities: [...new Set(everyone.map((m) => m.city).filter(Boolean))].sort(),
  };
}

/** Semua member yang lolos filter (untuk Export CSV). */
export async function exportMembers(query: MembersQuery): Promise<MemberListItem[]> {
  const d = await getDataset();
  return sortMembers(applyFilters(allMembers(d), { ...query, page: undefined }, d.now), query.sort, query.dir);
}

/** Segmen tersimpan (tabel member_segments) — filter disimpan sebagai query. */
export async function listSegments(): Promise<Segment[]> {
  const d = await getDataset();
  const everyone = allMembers(d);
  const defs: Omit<Segment, "count">[] = [
    { id: "gold-jakarta", name: "Gold+ di Jakarta", query: { tier: "gold", city: "Jakarta" } },
    { id: "beginner-new", name: "Beginner baru (30 hari)", query: { tab: "new", level: "beginner" } },
    { id: "inactive", name: "Belum main 60 hari", query: { tab: "inactive" } },
    { id: "trip", name: "Minat Tennis Trip", query: { interest: "Tennis Trip / Destination" } },
    { id: "dining", name: "Suka Tennis + Dining", query: { interest: "Tennis + Dining" } },
  ];
  return defs.map((segment) => ({ ...segment, count: applyFilters(everyone, segment.query, d.now).length }));
}

export async function getMember(id: string): Promise<MemberDetail | null> {
  const d = await getDataset();
  const member = d.memberById.get(id);
  if (!member) return null;
  const stats = d.stats(id);
  const list = toListItem(d, member);

  const memberBookings = d
    .bookingsOf(id)
    .filter((b) => d.sessionById.has(b.sessionId))
    .map((b) => ({ booking: b, session: d.sessionById.get(b.sessionId)! }))
    .sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());

  const timeline: MemberTimelineItem[] = [];
  for (const { booking, session } of memberBookings.slice(0, 8)) {
    const when = `${session.venueName} · ${new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(session.startsAt)}`;
    if (booking.status === "registered") {
      timeline.push({ kind: "booking", title: `Booking ${session.title}`, detail: when, at: booking.createdAt.toISOString(), badge: { label: "Terdaftar", tone: "indigo" } });
    } else if (booking.status === "attended") {
      timeline.push({ kind: "attended", title: `Hadir di ${session.title}`, detail: when, at: session.startsAt.toISOString(), badge: { label: `+${session.pointsPerAttendance} pts`, tone: "lime" } });
    } else if (booking.status === "no_show") {
      timeline.push({ kind: "no_show", title: `Tidak hadir ${session.title}`, detail: when, at: session.startsAt.toISOString(), badge: { label: "No-show", tone: "pink" } });
    }
  }
  for (const order of d.ordersOf(id).slice(0, 3)) {
    timeline.push({
      kind: "purchase",
      title: `Membeli ${order.items[0].name}`,
      detail: `Order #${order.code} · Rp${order.total.toLocaleString("id-ID")}`,
      at: order.placedAt.toISOString(),
      badge: { label: order.payment === "paid" ? "Lunas" : "Menunggu", tone: order.payment === "paid" ? "lime" : "neutral" },
    });
  }
  if (stats.tier !== "basic") {
    const tierInfo = TIERS.find((t) => t.tier === stats.tier)!;
    timeline.push({
      kind: "tier",
      title: `Naik tier ke ${tierInfo.label}`,
      detail: `Mencapai ${tierInfo.minPoints.toLocaleString("id-ID")} Slay Point`,
      at: new Date(d.now.getTime() - 25 * DAY).toISOString(),
      badge: { label: "Tier", tone: "neutral" },
    });
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const due = stats.sessionsAttended + stats.noShows;
  return {
    ...list,
    phone: member.phone,
    birthDate: member.birthDate || null,
    gender: member.gender,
    reclubId: null,
    playFormat: member.playFormat,
    hand: member.hand,
    playingSince: member.playingSince,
    hoursPlayed: Math.round(stats.hoursPlayed),
    attendanceRate: due ? Math.round((stats.sessionsAttended / due) * 100) : 0,
    totalSpent: stats.totalSpent,
    pointsEarned: stats.pointsEarned,
    timeline: timeline.slice(0, 8),
    bookings: memberBookings.slice(0, 8).map(({ booking, session }) => ({
      sessionTitle: session.title,
      venueName: session.venueName,
      startsAt: session.startsAt.toISOString(),
      payment: booking.payment,
      status: booking.status,
    })),
    notes:
      !d.live && id === "m0001"
        ? [{ id: "n1", author: "Rara", body: "Suka main pagi, sering bawa teman baru. Kandidat ambassador Bali trip.", at: new Date(d.now.getTime() - 16 * DAY).toISOString() }]
        : [],
  };
}

// ── Overview ────────────────────────────────────────────────────────────────
const weekStart = jakartaWeekStart;

const needsProcessing = (o: { status: string; payment: string }) => o.status === "processing" || (o.status === "pending" && o.payment === "paid");

/** Angka badge sidebar (dipakai layout di setiap halaman admin) — tanpa menghitung overview penuh. */
export async function getSidebarCounts() {
  const d = await getDataset();
  return { members: d.members.length, ordersToProcess: d.orders.filter(needsProcessing).length };
}

export async function getOverview(weeks = 12): Promise<OverviewData> {
  const d = await getDataset();
  const { bookings, sessions, orders, sessionById, memberById } = d;
  const everyone = allMembers(d);
  const now = d.now.getTime();
  const thisWeek = weekStart(d.now).getTime();
  // Awal bulan dalam WIB.
  const wibNow = new Date(now + 7 * 3600_000);
  const monthStart = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), 1) - 7 * 3600_000;
  const prevMonthStart = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth() - 1, 1) - 7 * 3600_000;

  // Booking per minggu (berdasarkan tanggal sesi), `weeks` minggu terakhir termasuk minggu ini.
  const weekly = new Map<number, number>();
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "waitlisted") continue;
    const s = sessionById.get(b.sessionId);
    if (!s) continue;
    const key = weekStart(s.startsAt).getTime();
    weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }
  const weeklyBookings = Array.from({ length: weeks }, (_, i) => {
    const start = thisWeek - (weeks - 1 - i) * 7 * DAY;
    return { weekStart: new Date(start).toISOString(), count: weekly.get(start) ?? 0 };
  });

  // KPI booking: booking yang DIBUAT 7 hari terakhir vs 7 hari sebelumnya (minggu berjalan
  // belum selesai, jadi membandingkan per minggu kalender akan selalu terlihat turun).
  const createdBetween = (from: number, to: number) =>
    bookings.filter((b) => b.status !== "cancelled" && b.createdAt.getTime() >= from && b.createdAt.getTime() < to).length;
  const bookingsThisWeek = createdBetween(now - 7 * DAY, now);
  const bookingsLastWeek = createdBetween(now - 14 * DAY, now - 7 * DAY);
  const sessionsThisWeek = sessions.filter((s) => s.status !== "draft" && s.status !== "cancelled" && weekStart(s.startsAt).getTime() === thisWeek);
  const capacityThisWeek = sessionsThisWeek.reduce((sum, s) => sum + s.capacity, 0);
  const bookedThisWeek = weekly.get(thisWeek) ?? 0;

  const pastBookings = (from: number, to: number) =>
    bookings.filter((b) => {
      const t = sessionById.get(b.sessionId)?.startsAt.getTime() ?? 0;
      return t >= from && t < to && (b.status === "attended" || b.status === "no_show");
    });
  const rate = (list: typeof bookings) => (list.length ? Math.round((list.filter((b) => b.status === "attended").length / list.length) * 100) : 0);
  const last30 = pastBookings(now - 30 * DAY, now);
  const prev30 = pastBookings(now - 60 * DAY, now - 30 * DAY);

  const paidIn = (from: number, to: number) => orders.filter((o) => o.payment === "paid" && o.placedAt.getTime() >= from && o.placedAt.getTime() < to);
  const salesThisMonth = paidIn(monthStart, now + DAY).reduce((s, o) => s + o.total, 0);
  // Bandingkan dengan periode yang sama di bulan lalu (hari ke-1 s/d hari ini).
  const elapsed = now - monthStart;
  const salesPrev = paidIn(prevMonthStart, prevMonthStart + elapsed).reduce((s, o) => s + o.total, 0);

  const active = everyone.filter((m) => m.status === "active").length;
  // Member aktif 30 hari lalu = pernah hadir di jendela 60 hari sebelum tanggal itu.
  const then = now - 30 * DAY;
  const activeThen = new Set(
    bookings
      .filter((b) => b.status === "attended")
      .filter((b) => {
        const t = sessionById.get(b.sessionId)?.startsAt.getTime() ?? 0;
        return t >= then - 60 * DAY && t < then;
      })
      .map((b) => b.memberId),
  ).size;

  const upcoming = sessions
    .filter((s) => s.status === "published" && s.startsAt.getTime() >= now && s.startsAt.getTime() < now + 7 * DAY)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const productSales = new Map<string, { sold: number; revenue: number }>();
  for (const o of paidIn(monthStart - 30 * DAY, now + DAY)) {
    for (const item of o.items) {
      const entry = productSales.get(item.productSlug) ?? { sold: 0, revenue: 0 };
      entry.sold += item.quantity;
      entry.revenue += item.price * item.quantity;
      productSales.set(item.productSlug, entry);
    }
  }

  return {
    generatedAt: d.now.toISOString(),
    kpis: {
      activeMembers: active,
      activeMembersDelta: pctDelta(active, activeThen),
      newMembersThisMonth: everyone.filter((m) => new Date(m.joinedAt).getTime() >= monthStart).length,
      bookingsThisWeek,
      bookingsDelta: pctDelta(bookingsThisWeek, bookingsLastWeek),
      capacityFilled: capacityThisWeek ? Math.round((bookedThisWeek / capacityThisWeek) * 100) : 0,
      salesThisMonth,
      salesDelta: pctDelta(salesThisMonth, salesPrev),
      ordersThisMonth: orders.filter((o) => o.placedAt.getTime() >= monthStart).length,
      attendanceRate: rate(last30),
      attendanceDelta: Math.round((rate(last30) - rate(prev30)) * 10) / 10,
      noShowsThisWeek: pastBookings(thisWeek, now).filter((b) => b.status === "no_show").length,
    },
    weeklyBookings,
    upcomingCount: upcoming.length,
    upcomingSessions: upcoming.slice(0, 4).map((s) => ({
      id: s.id,
      title: s.title,
      venueName: s.venueName,
      startsAt: s.startsAt.toISOString(),
      capacity: s.capacity,
      booked: bookings.filter((b) => b.sessionId === s.id && (b.status === "registered" || b.status === "attended" || b.status === "no_show")).length,
    })),
    newestMembers: [...everyone].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)).slice(0, 5),
    tierDistribution: TIERS.map(({ tier }) => ({ tier, count: everyone.filter((m) => m.tier === tier && m.status !== "suspended").length })),
    levelDistribution: (Object.keys(LEVEL_LABEL) as TennisLevel[]).map((level) => ({
      level,
      count: everyone.filter((m) => m.level === level).length,
    })),
    recentOrders: orders.slice(0, 4).map((o) => ({
      code: o.code,
      customer: memberById.get(o.memberId)?.fullName ?? "—",
      items: `${o.items[0].name} ×${o.items[0].quantity}`,
      total: o.total,
      payment: o.payment,
      status: o.status,
      placedAt: o.placedAt.toISOString(),
    })),
    ordersToProcess: orders.filter(needsProcessing).length,
    topProducts: [...productSales.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 4)
      .flatMap(([slug, sale]) => {
        const product = findProduct(slug);
        return product ? [{ name: product.name, image: product.image, ...sale }] : [];
      }),
  };
}

