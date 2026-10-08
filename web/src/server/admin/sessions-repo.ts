import "server-only";
import { venueList } from "@/content/venues";
import { getDataset, type DataSession, type Dataset } from "./dataset";
import { activityTypeLabels } from "./demo-data";
import { DAY } from "./time";
import type { SessionDetail, SessionDisplayStatus, SessionRow, SessionsQuery, SessionsResult } from "./types";

/**
 * Data Activities (tabel sessions + session_fill). Sama seperti repo.ts: data demo sampai
 * Supabase tersambung, tanda tangan fungsi tetap.
 */

const ALTITUDE = { city: "Bali", type: "Outdoor", image: "/images/activity/featured-altitude.webp" };

function venueMeta(name: string) {
  const venue = venueList.find((v) => v.name === name);
  return venue ? { city: venue.city, type: venue.type, image: venue.image } : ALTITUDE;
}

function fill(d: Dataset, sessionId: string) {
  let booked = 0;
  let waitlisted = 0;
  for (const b of d.bookingsOfSession(sessionId)) {
    if (b.status === "waitlisted") waitlisted++;
    else if (b.status !== "cancelled") booked++;
  }
  return { booked, waitlisted };
}

function displayStatus(s: DataSession, booked: number, now: Date): SessionDisplayStatus {
  if (s.status !== "published") return s.status;
  if (s.publishAt && s.publishAt > now) return "scheduled";
  if (booked >= s.capacity) return "full";
  if (booked / s.capacity >= 0.85) return "almost_full";
  return "published";
}

function toRow(d: Dataset, s: DataSession): SessionRow {
  const meta = venueMeta(s.venueName);
  const { booked, waitlisted } = fill(d, s.id);
  return {
    id: s.id,
    title: s.title,
    typeSlug: s.typeSlug,
    typeLabel: activityTypeLabels[s.typeSlug] ?? s.typeSlug,
    image: meta.image,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    venueName: s.venueName,
    venueCity: meta.city,
    venueType: meta.type,
    capacity: s.capacity,
    booked,
    waitlisted,
    price: s.price,
    status: s.status,
    displayStatus: displayStatus(s, booked, d.now),
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function inTab(s: DataSession, tab: SessionsQuery["tab"], now: Date) {
  const future = s.startsAt >= now;
  if (tab === "completed") return s.status === "completed";
  if (tab === "draft") return s.status === "draft";
  if (tab === "archived") return s.status === "cancelled";
  return future && s.status !== "cancelled";
}

export async function listSessions(query: SessionsQuery): Promise<SessionsResult> {
  const d = await getDataset();
  const { sessions, now } = d;
  const tab = query.tab ?? "upcoming";
  // Tab Mendatang default 30 hari ke depan; tab lain tanpa batas tanggal kecuali dipilih.
  const days = query.range && query.range !== "all" ? Number(query.range) : tab === "upcoming" && query.range !== "all" ? 30 : 0;
  const range = days ? { from: isoDay(now), to: isoDay(new Date(now.getTime() + days * DAY)) } : null;
  const q = query.q?.trim().toLowerCase();

  const items = sessions
    .filter((s) => inTab(s, tab, now))
    .filter((s) => !range || (isoDay(s.startsAt) >= range.from && isoDay(s.startsAt) <= range.to))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.venueName.toLowerCase().includes(q))
    .filter((s) => !query.type || s.typeSlug === query.type)
    .filter((s) => !query.venue || s.venueName === query.venue)
    .filter((s) => !query.city || venueMeta(s.venueName).city === query.city)
    .sort((a, b) => (tab === "upcoming" || tab === "draft" ? a.startsAt.getTime() - b.startsAt.getTime() : b.startsAt.getTime() - a.startsAt.getTime()))
    .slice(0, 60)
    .map((s) => toRow(d, s));

  return {
    items,
    counts: {
      upcoming: sessions.filter((s) => inTab(s, "upcoming", now)).length,
      completed: sessions.filter((s) => s.status === "completed").length,
      draft: sessions.filter((s) => s.status === "draft").length,
      archived: sessions.filter((s) => s.status === "cancelled").length,
    },
    venues: [...new Set(sessions.map((s) => s.venueName))].sort(),
    types: Object.entries(activityTypeLabels).map(([slug, label]) => ({ slug, label })),
    range,
  };
}

const CREW_POOL = ["Rara Anindya", "Bima Pratama", "Lia Oktaviani", "Gilang Hermawan", "Putri Saraswati"];

export async function getSession(id: string): Promise<SessionDetail | null> {
  const d = await getDataset();
  const s = d.sessionById.get(id);
  if (!s) return null;
  const row = toRow(d, s);
  const participants = d
    .bookingsOfSession(id)
    .filter((b) => b.status !== "cancelled" && d.memberById.has(b.memberId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((b, i) => {
      const m = d.memberById.get(b.memberId)!;
      return {
        memberId: m.id,
        name: m.fullName,
        handle: m.instagram,
        level: m.level,
        payment: b.payment,
        status: b.status,
        source: b.source ?? ((i % 5 === 1 ? "kuy" : i % 7 === 3 ? "admin" : "website") as "website" | "kuy" | "admin"),
        checkedIn: b.checkedIn ?? b.status === "attended",
        guests: b.guests ?? (i % 9 === 3 ? 1 : 0),
      };
    });
  const seed = Number(id.replace(/\D/g, "")) || 0;
  return {
    ...row,
    description: s.description,
    court: s.court,
    courts: s.courts?.length ? [...new Set([...s.courts, s.court].filter(Boolean))] : ["Court 1", "Court 2", "Court 2 & 3", "Center court"],
    pointsPerAttendance: s.pointsPerAttendance,
    visibility: s.visibility,
    publishAt: s.publishAt?.toISOString() ?? null,
    waitlistEnabled: s.waitlistEnabled,
    membersOnly: s.membersOnly,
    showOnHomepage: s.showOnHomepage,
    recommendedLevels: s.recommendedLevels,
    repeatWeekly: s.repeatWeekly,
    // Link Kuy contoh hanya untuk mode demo; data live menampilkan apa adanya.
    kuyUrl: d.live ? (s.kuyUrl ?? "") : `https://kuy.id/soslay/${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}-${s.startsAt.getDate()}`,
    crew: s.crew ?? [
      { name: CREW_POOL[seed % CREW_POOL.length], role: "Host" },
      ...(s.typeSlug === "beginner-coaching" || s.typeSlug === "weekly-mabar" ? [{ name: "Bima Pratama", role: "Coach" as const }] : []),
      { name: "Lia Oktaviani", role: "Fotografer" },
    ],
    participants,
    paid: participants.filter((p) => p.payment === "paid" && p.status !== "waitlisted").length,
    checkedIn: participants.filter((p) => p.checkedIn).length,
  };
}

/** Untuk form "Buat sesi": daftar venue + lapangan. */
export async function venueOptions() {
  return [...venueList.map((v) => ({ name: v.name, city: v.city, image: v.image })), { name: "Altitude Kintamani", city: ALTITUDE.city, image: ALTITUDE.image }];
}

/**
 * Isi awal form "Buat sesi". Dengan `fromId` (Duplikat): salin sesi itu ke minggu berikutnya
 * sebagai draft tanpa peserta; tanpa `fromId`: sesi kosong Sabtu depan 07.00–11.00.
 */
export async function getSessionDraft(fromId?: string): Promise<SessionDetail> {
  const source = fromId ? await getSession(fromId) : null;
  const now = (await getDataset()).now.getTime();
  const WEEK = 7 * DAY;
  if (source) {
    const shift = (iso: string) => {
      let t = new Date(iso).getTime() + WEEK;
      while (t < now) t += WEEK;
      return new Date(t).toISOString();
    };
    return {
      ...source,
      id: "",
      title: `${source.title} (salinan)`,
      startsAt: shift(source.startsAt),
      endsAt: shift(source.endsAt),
      status: "draft",
      displayStatus: "draft",
      publishAt: null,
      booked: 0,
      waitlisted: 0,
      participants: [],
      paid: 0,
      checkedIn: 0,
    };
  }
  // Sabtu berikutnya 07.00 WIB (00.00 UTC).
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + ((6 - start.getUTCDay() + 7) % 7 || 7));
  start.setUTCHours(0, 0, 0, 0);
  const venue = venueList[0];
  return {
    id: "",
    title: "",
    typeSlug: "weekly-mabar",
    typeLabel: activityTypeLabels["weekly-mabar"] ?? "Weekly MABAR",
    image: venue.image,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 4 * 3600_000).toISOString(),
    venueName: venue.name,
    venueCity: venue.city,
    venueType: venue.type,
    capacity: 24,
    booked: 0,
    waitlisted: 0,
    price: 150_000,
    status: "draft",
    displayStatus: "draft",
    description: "",
    court: "Court 1",
    courts: ["Court 1", "Court 2", "Court 2 & 3", "Center court"],
    pointsPerAttendance: 50,
    visibility: "public",
    publishAt: null,
    waitlistEnabled: true,
    membersOnly: false,
    showOnHomepage: false,
    recommendedLevels: [],
    repeatWeekly: false,
    kuyUrl: "",
    crew: [{ name: "Rara Anindya", role: "Host" }],
    participants: [],
    paid: 0,
    checkedIn: 0,
  };
}

export function activityTypeOptions() {
  return Object.entries(activityTypeLabels).map(([slug, label]) => ({ slug, label }));
}
