import "server-only";
import { venueList } from "@/content/venues";
import { isSessionFinished } from "@/lib/session-lock";
import type { DataSession, Dataset } from "./dataset";
import { activityTypeLabels } from "./demo-data";
import type { SessionDisplayStatus, SessionRow } from "./types";

/** Baris daftar Activities dari satu sesi (dipakai daftar sesi & activity dalam trip). */

const ALTITUDE = { city: "Bali", type: "Outdoor", image: "/images/activity/featured-altitude.webp" };

export function venueMeta(name: string) {
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
export const isFinished = (s: DataSession, now: Date) => isSessionFinished({ status: s.status, endedAt: null, endsAt: s.endsAt, now });

function displayStatus(s: DataSession, booked: number, now: Date): SessionDisplayStatus {
  if (isFinished(s, now)) return "completed";
  if (s.status !== "published") return s.status;
  if (s.publishAt && s.publishAt > now) return "scheduled";
  if (booked >= s.capacity) return "full";
  if (booked / s.capacity >= 0.85) return "almost_full";
  return "published";
}

export function toRow(d: Dataset, s: DataSession): SessionRow {
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

