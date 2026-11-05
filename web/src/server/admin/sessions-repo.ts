import "server-only";
import { generateLineup, usesLineup, scoreTarget } from "@/lib/americano";
import { sessionClosesAt } from "@/lib/session-close";
import { isSessionFinished } from "@/lib/session-lock";
import { venueList } from "@/content/venues";
import { venueChoices } from "./catalog-repo";
import { getDataset, type DataSession, type Dataset } from "./dataset";
import { activityTypeLabels } from "./demo-data";
import { DEFAULT_PLAY, loadSessionPlay, NO_PHOTOS } from "./play-repo";
import { DAY } from "./time";
import type { SessionDetail, SessionDisplayStatus, SessionParticipant, SessionRow, SessionSort, SessionsQuery, SessionsResult } from "./types";

/**
 * Data Activities (tabel sessions + session_fill). Sama seperti repo.ts: data demo sampai
 * Supabase tersambung, tanda tangan fungsi tetap.
 */

const ALTITUDE = { city: "Bali", type: "Outdoor", image: "/images/activity/featured-altitude.webp" };

function venueMeta(name: string) {
  const venue = venueList.find((v) => v.name === name);
  return venue ? { city: venue.city, type: venue.type, image: venue.image } : ALTITUDE;
}

/** Terisi (Dataset.filled — daftar peserta + booking aktif di luar daftar itu) & jumlah waitlist. */
function fill(d: Dataset, sessionId: string) {
  const waitlisted = d.bookingsOfSession(sessionId).filter((b) => b.status === "waitlisted").length;
  return { booked: d.filled(sessionId), waitlisted };
}

/**
 * Selesai = diakhiri lewat "Akhiri Activity" (status completed) ATAU sudah ditutup otomatis (jam
 * selesai + jeda 30 menit, lib/session-close) — aturan yang sama dengan halaman sesi member
 * (phaseOf). Tanpa ini sesi yang tidak diakhiri host hilang dari semua tab.
 */
const isFinished = (s: DataSession, now: Date) => isSessionFinished({ status: s.status, endedAt: null, endsAt: s.endsAt, now });

function displayStatus(s: DataSession, booked: number, now: Date): SessionDisplayStatus {
  if (isFinished(s, now)) return "completed";
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
    // Thumbnail activity (cover sesi); tanpa itu → foto venue. Thumbnail album Foto hanya untuk tab Foto member.
    image: s.coverPath || meta.image,
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
  if (tab === "completed") return isFinished(s, now);
  if (tab === "draft") return s.status === "draft";
  if (tab === "archived") return s.status === "cancelled";
  // Mendatang termasuk sesi yang sedang berjalan (sudah mulai, belum ditutup). Draft yang jadwalnya
  // lewat tetap hanya di tab Draft.
  return s.status !== "cancelled" && !isFinished(s, now) && sessionClosesAt(s.endsAt) >= now.getTime();
}

/** Mode demo tidak menyimpan waktu dibuat → anggap dibuat 3 minggu sebelum sesi. */
const createdAt = (s: DataSession) => s.createdAt ?? new Date(s.startsAt.getTime() - 21 * DAY);

const SORT_KEY: Record<SessionSort, (a: DataSession, b: DataSession) => number> = {
  schedule: (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  title: (a, b) => a.title.localeCompare(b.title, "id") || a.startsAt.getTime() - b.startsAt.getTime(),
  created: (a, b) => createdAt(a).getTime() - createdAt(b).getTime(),
};

export async function listSessions(query: SessionsQuery): Promise<SessionsResult> {
  const d = await getDataset();
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

  const items = sessions
    .filter((s) => inTab(s, tab, now))
    .filter((s) => !range || (isoDay(s.startsAt) >= range.from && isoDay(s.startsAt) <= range.to))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.venueName.toLowerCase().includes(q))
    .filter((s) => !query.type || s.typeSlug === query.type)
    .filter((s) => !query.venue || s.venueName === query.venue)
    .sort((a, b) => sign * SORT_KEY[sort](a, b))
    .slice(0, 60)
    .map((s) => toRow(d, s));

  return {
    items,
    counts: {
      upcoming: sessions.filter((s) => inTab(s, "upcoming", now)).length,
      completed: sessions.filter((s) => inTab(s, "completed", now)).length,
      draft: sessions.filter((s) => s.status === "draft").length,
      archived: sessions.filter((s) => s.status === "cancelled").length,
    },
    venues: [...new Set(sessions.map((s) => s.venueName))].sort(),
    types: Object.entries(activityTypeLabels).map(([slug, label]) => ({ slug, label })),
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
