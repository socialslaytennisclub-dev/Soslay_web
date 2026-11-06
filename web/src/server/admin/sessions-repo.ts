import "server-only";
import { generateLineup, usesLineup, scoreTarget } from "@/lib/americano";
import { sessionClosesAt } from "@/lib/session-close";
import { venueChoices } from "./catalog-repo";
import { getDataset, type DataSession } from "./dataset";
import { venueList } from "@/content/venues";
import { activityTypeLabels } from "./demo-data";
import { isFinished, toRow } from "./session-rows";
import { listTripDetails, tripDisplayStatus, tripSummary } from "./trips-repo";
import { DEFAULT_PLAY, loadSessionPlay, NO_PHOTOS } from "./play-repo";
import { DAY } from "./time";
import type { ActivityListRow, SessionDetail, SessionParticipant, SessionSort, SessionsQuery, SessionsResult } from "./types";

/**
 * Data Activities (tabel sessions + session_fill). Sama seperti repo.ts: data demo sampai
 * Supabase tersambung, tanda tangan fungsi tetap.
 */

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function inTab(s: DataSession, tab: SessionsQuery["tab"], now: Date) {
  if (tab === "completed") return isFinished(s, now);
  if (tab === "draft") return s.status === "draft";
  if (tab === "archived") return s.status === "cancelled";
  // Mendatang termasuk sesi yang sedang berjalan (sudah mulai, belum ditutup). Draft yang jadwalnya
  // lewat tetap hanya di tab Draft.
  return s.status !== "cancelled" && !isFinished(s, now) && sessionClosesAt(s.endsAt) >= now.getTime();
}

/** Mode demo tidak menyimpan waktu dibuat → anggap dibuat 3 minggu sebelum sesi. */
const createdAt = (s: DataSession) => s.createdAt ?? new Date(s.startsAt.getTime() - 21 * DAY);

type Sortable = { startsAt: number; title: string; created: number };
const SORT_KEY: Record<SessionSort, (a: Sortable, b: Sortable) => number> = {
  schedule: (a, b) => a.startsAt - b.startsAt,
  title: (a, b) => a.title.localeCompare(b.title, "id") || a.startsAt - b.startsAt,
  created: (a, b) => a.created - b.created,
};

export async function listSessions(query: SessionsQuery): Promise<SessionsResult> {
  const [d, tripDetails] = await Promise.all([getDataset(), listTripDetails()]);
  const { sessions, now } = d;
  const tab = query.tab ?? "upcoming";
  // Tab Mendatang default 30 hari ke depan; tab lain tanpa batas tanggal kecuali dipilih.
  const days = query.range && query.range !== "all" ? Number(query.range) : tab === "upcoming" && query.range !== "all" ? 30 : 0;
  const range = days ? { from: isoDay(now), to: isoDay(new Date(now.getTime() + days * DAY)) } : null;
  const q = query.q?.trim().toLowerCase();
  // Default: mendatang & draft dari jadwal terdekat; selesai & arsip dari yang terbaru.
  const sort = query.sort ?? "schedule";
  const dir = query.dir ?? (query.sort ? (sort === "title" ? "asc" : "desc") : tab === "upcoming" || tab === "draft" ? "asc" : "desc");
  const sign = dir === "asc" ? 1 : -1;

  // Activity trip tampil di bawah baris induk trip, bukan sebagai baris sendiri.
  const standalone = sessions.filter((s) => !s.tripId);
  const sessionRows = standalone
    .filter((s) => inTab(s, tab, now))
    .filter((s) => !range || (isoDay(s.startsAt) >= range.from && isoDay(s.startsAt) <= range.to))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.venueName.toLowerCase().includes(q))
    .filter((s) => !query.type || s.typeSlug === query.type)
    .filter((s) => !query.venue || s.venueName === query.venue)
    .map((s) => ({ kind: "session" as const, session: s, startsAt: s.startsAt.getTime(), title: s.title, created: createdAt(s).getTime() }));

  // Trip: satu baris induk di tanggal mulai trip (filter Tipe "Trip" = hanya trip).
  const today = isoDay(now);
  const trips = tripDetails.map((trip) => ({ trip, display: tripDisplayStatus(trip, today) }));
  const tripInTab = (t: (typeof trips)[number], which: SessionsQuery["tab"]) =>
    which === "draft" ? t.display === "draft" : which === "archived" ? t.display === "cancelled" : which === "completed" ? t.display === "completed" : t.display === "published";
  const tripRows = trips
    .filter((t) => tripInTab(t, tab))
    .filter(({ trip }) => !range || (trip.startsOn <= range.to && trip.endsOn >= range.from))
    .filter(({ trip }) => !q || [trip.title, trip.area, ...trip.activities.flatMap((a) => [a.title, a.venueName])].some((v) => v.toLowerCase().includes(q)))
    .filter(() => !query.type || query.type === "trip")
    .filter(({ trip }) => !query.venue || trip.activities.some((a) => a.venueName === query.venue))
    .map(({ trip, display }) => ({
      kind: "trip" as const,
      item: { trip, summary: tripSummary(trip), display },
      startsAt: Date.parse(`${trip.startsOn}T00:00:00+07:00`),
      title: trip.title,
      created: Date.parse(`${trip.startsOn}T00:00:00+07:00`) - 60 * DAY,
    }));
  const sessionsOnly = query.type === "trip" ? [] : sessionRows;
  const rows = [...sessionsOnly, ...tripRows]
    .sort((a, b) => sign * SORT_KEY[sort](a, b))
    .slice(0, 60)
    .map((r): ActivityListRow => (r.kind === "session" ? { kind: "session", session: toRow(d, r.session) } : { kind: "trip", item: r.item }));

  return {
    rows,
    counts: {
      upcoming: standalone.filter((s) => inTab(s, "upcoming", now)).length + trips.filter((t) => tripInTab(t, "upcoming")).length,
      completed: standalone.filter((s) => inTab(s, "completed", now)).length + trips.filter((t) => tripInTab(t, "completed")).length,
      draft: standalone.filter((s) => s.status === "draft").length + trips.filter((t) => tripInTab(t, "draft")).length,
      archived: standalone.filter((s) => s.status === "cancelled").length + trips.filter((t) => tripInTab(t, "archived")).length,
    },
    venues: [...new Set(sessions.map((s) => s.venueName))].sort(),
    types: [...Object.entries(activityTypeLabels).map(([slug, label]) => ({ slug, label })), { slug: "trip", label: "Trip" }],
    range,
    sort,
    dir,
  };
}

/** Mode demo: line-up contoh (acak tetap per sesi), dua ronde pertama sudah berskor. */
function demoLineup(sessionId: string, participants: SessionParticipant[], play: SessionDetail["play"]): SessionDetail["matches"] {
  let seed = [...sessionId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const players = participants.filter((p) => p.status !== "waitlisted").map((p) => p.id);
  const target = scoreTarget(play.matchFormat, play.targetPoints);
  const randInt = (max: number) => Math.floor(rand() * (max + 1));
  return generateLineup({ players, courts: play.courtCount, rounds: play.roundCount }, { rand, attempts: 8 }).map((m) => {
    const id = `${sessionId}-r${m.round}-c${m.court}`;
    if (m.round > 2) return { ...m, id, scoreA: null, scoreB: null };
    if (target !== null) {
      const a = randInt(target);
      return { ...m, id, scoreA: a, scoreB: target - a };
    }
    // Tanpa target (Rotating Partner): satu tim menang 6, lawannya 0–5.
    const [a, b] = rand() < 0.5 ? [6, randInt(5)] : [randInt(5), 6];
    return { ...m, id, scoreA: a, scoreB: b };
  });
}

const CREW_POOL = ["Rara Anindya", "Bima Pratama", "Lia Oktaviani", "Gilang Hermawan", "Putri Saraswati"];

export async function getSession(id: string): Promise<SessionDetail | null> {
  const d = await getDataset();
  const s = d.sessionById.get(id);
  if (!s) return null;
  const row = toRow(d, s);
  const fromBookings = d
    .bookingsOfSession(id)
    .filter((b) => b.status !== "cancelled" && d.memberById.has(b.memberId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((b, i): SessionParticipant => {
      const m = d.memberById.get(b.memberId)!;
      const source = b.source ?? ((i % 5 === 1 ? "kuy" : i % 7 === 3 ? "admin" : "website") as "website" | "kuy" | "admin");
      return {
        id: m.id,
        memberId: m.id,
        name: m.fullName,
        kuyId: m.kuyId,
        memberCode: m.memberCode,
        ghostActivities: null,
        phone: m.phone,
        level: m.level,
        payment: b.payment,
        status: b.status,
        source,
        // Demo: peserta "Kuy" memakai harga sesi supaya form ubah nominal bisa dicoba.
        kuyPayment: source === "kuy" ? { amount: s.price, via: "kuy" } : null,
        checkedIn: b.checkedIn ?? b.status === "attended",
        guests: b.guests ?? (i % 9 === 3 ? 1 : 0),
      };
    });
  const { play, roster, hosts, matches, photos } = await loadSessionPlay(s, d.live);
  // Daftar peserta (impor Kuyy) menggantikan daftar booking begitu ada; booking yang member-nya belum ada di
  // daftar itu (mis. booking website setelah impor) tetap ikut — sama dengan session_roster & session_fill_counts.
  const inRoster = new Set(roster?.map((p) => p.memberId).filter(Boolean));
  const participants = roster ? [...roster, ...fromBookings.filter((p) => !inRoster.has(p.memberId))] : fromBookings;
  if (!d.live && usesLineup(play.matchFormat)) matches.push(...demoLineup(id, participants, play));
  const seed = Number(id.replace(/\D/g, "")) || 0;
  return {
    ...row,
    description: s.description,
    coverPath: s.coverPath ?? null,
    court: s.court,
    courts: s.courts?.length ? [...new Set([...s.courts, s.court].filter(Boolean))] : ["Court 1", "Court 2", "Court 2 & 3", "Center court"],
    pointsPerAttendance: s.pointsPerAttendance,
    visibility: s.visibility,
    publishAt: s.publishAt?.toISOString() ?? null,
    visibleUntil: s.visibleUntil?.toISOString() ?? null,
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
    play,
    hosts,
    matches,
    photos,
  };
}

/** Untuk form "Buat sesi": daftar venue + lapangan (tabel venues saat live). */
export async function venueOptions() {
  return venueChoices();
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
      // Tiap event Kuyy punya link sendiri — jangan ikut tersalin ke sesi baru.
      kuyUrl: "",
      startsAt: shift(source.startsAt),
      endsAt: shift(source.endsAt),
      status: "draft",
      displayStatus: "draft",
      publishAt: null,
      visibleUntil: null,
      booked: 0,
      waitlisted: 0,
      participants: [],
      paid: 0,
      checkedIn: 0,
      play: { ...source.play, liveStartedAt: null, endedAt: null },
      hosts: [],
      matches: [],
      photos: NO_PHOTOS,
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
    coverPath: null,
    court: "Court 1",
    courts: ["Court 1", "Court 2", "Court 2 & 3", "Center court"],
    pointsPerAttendance: 50,
    visibility: "public",
    publishAt: null,
    visibleUntil: null,
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
    play: DEFAULT_PLAY,
    hosts: [],
    matches: [],
    photos: NO_PHOTOS,
  };
}

export function activityTypeOptions() {
  return Object.entries(activityTypeLabels).map(([slug, label]) => ({ slug, label }));
}
