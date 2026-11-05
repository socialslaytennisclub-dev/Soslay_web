import "server-only";
import { cache } from "react";
import { socialLinks } from "@/content/site";
import { wibParts } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { bookingMoney, dayLabel, settlementDue, shortDate, todayWib, type BookingMoney, type TripPaymentKind, TRIP_PLACEHOLDER } from "@/lib/trips";
import { demoTrip, demoTripBookings, demoTripRundown } from "@/server/admin/trip-demo";
import { getMemberSession } from "./user";

/**
 * Trip Tennis Escape milik member (BR-22): banner "Special event · Tennis trip" di My Activities dan halaman
 * trip (/akun/trip/[slug]). Pembeli paket melihat paket, pembayaran, rundown & semua activity; peserta
 * satuan hanya activity yang dibeli + info trip. Tanpa Supabase → trip contoh.
 */

export type MemberTripActivity = { slug: string | null; order: number; title: string; venue: string; day: string; start: string; end: string };
export type MemberTripRundown = { day: string; time: string; title: string; location: string; activity: { slug: string | null; order: number } | null };

export type MemberTrip = {
  slug: string;
  title: string;
  description: string;
  area: string;
  startsOn: string;
  endsOn: string;
  image: string;
  inclusions: string[];
  /** Null = peserta satuan (tanpa paket). */
  package: (BookingMoney & { due: string }) | null;
  activities: MemberTripActivity[];
  /** Kosong untuk peserta satuan / rundown disembunyikan admin. */
  rundown: MemberTripRundown[];
  /** "Sab 17 Okt · 05.30 Penjemputan di hotel…, 07.00 Lapangan Maya Ubud". */
  next: string | null;
  adminWa: string;
};

const ADMIN_WA = socialLinks.find((l) => l.label === "WhatsApp")?.href ?? "https://wa.me/62642424792";

/** Agenda berikutnya: hari rundown pertama yang belum lewat, dua acara pertamanya. */
function nextAgenda(rundown: MemberTripRundown[], activities: MemberTripActivity[], today: string): string | null {
  const day = rundown.find((r) => r.day >= today)?.day ?? activities.find((a) => a.day >= today)?.day;
  if (!day) return null;
  const items = rundown.length ? rundown.filter((r) => r.day === day).slice(0, 2).map((r) => `${r.time.split(" ")[0]} ${r.title.length > 28 ? `${r.title.slice(0, 27)}…` : r.title}`) : activities.filter((a) => a.day === day).map((a) => `${a.start} ${a.title}`);
  return `${dayLabel(day).replace(",", "")} · ${items.join(", ")}`;
}

type TripDb = {
  id: string; slug: string; title: string; description: string; area: string; starts_on: string; ends_on: string; cover_path: string | null;
  show_rundown: boolean; price_normal: number; price_early_bird: number | null; early_bird_until: string | null; inclusions: string[];
};
type SessionDb = { id: string; slug: string; title: string; starts_at: string; ends_at: string; trip_id: string; trip_order: number | null; cover_path: string | null; venues: { name: string; cover_path: string | null } | null };

function demoTrips(): MemberTrip[] {
  const today = todayWib(new Date("2026-10-07T10:00:00+07:00"));
  // Contoh: paket early bird yang baru DP (Figma DT-1 / MT-2).
  const b = demoTripBookings[2];
  const money = bookingMoney(demoTrip, b.payments, today);
  const activities = demoTripRundown
    .filter((r) => r.sessionId)
    .map((r, i) => ({ slug: null, order: i + 1, title: r.title, venue: r.location, day: r.day, start: r.time.split(" ")[0], end: r.time.split(" ").at(-1) ?? "" }));
  const rundown = demoTripRundown.map((r) => ({ day: r.day, time: r.time, title: r.title, location: r.location, activity: r.sessionId ? { slug: null, order: Number(r.sessionId.split("-a")[1]) } : null }));
  return [
    {
      slug: demoTrip.slug,
      title: demoTrip.title,
      description: demoTrip.description,
      area: demoTrip.area,
      startsOn: demoTrip.startsOn,
      endsOn: demoTrip.endsOn,
      image: TRIP_PLACEHOLDER,
      inclusions: demoTrip.inclusions,
      package: { ...money, due: shortDate(settlementDue(demoTrip.startsOn)) },
      activities,
      rundown,
      next: nextAgenda(rundown, activities, today),
      adminWa: ADMIN_WA,
    },
  ];
}

export const getMyTrips = cache(async (): Promise<MemberTrip[]> => {
  if (!isSupabaseConfigured) return demoTrips();
  const { supabase, user } = await getMemberSession();
  if (!user) return [];

  // Paket (trip_bookings milik sendiri) + activity trip yang ia ikuti (paket / satuan).
  const [{ data: bookings }, { data: myBookings }] = await Promise.all([
    supabase.from("trip_bookings").select("id, trip_id").eq("member_id", user.id).is("cancelled_at", null),
    supabase.from("bookings").select("session_id").eq("member_id", user.id).neq("status", "cancelled"),
  ]);
  const sessionIds = (myBookings ?? []).map((b) => b.session_id as string);
  const { data: tripSessions } = sessionIds.length ? await supabase.from("sessions").select("trip_id").in("id", sessionIds).not("trip_id", "is", null) : { data: [] };
  const tripIds = [...new Set([...(bookings ?? []).map((b) => b.trip_id as string), ...(tripSessions ?? []).map((s) => s.trip_id as string)])];
  if (!tripIds.length) return [];

  const bookingIds = (bookings ?? []).map((b) => b.id as string);
  const [{ data: trips }, { data: sessions }, { data: payments }, { data: rundown }] = await Promise.all([
    supabase.from("trips").select("id, slug, title, description, area, starts_on, ends_on, cover_path, show_rundown, price_normal, price_early_bird, early_bird_until, inclusions").in("id", tripIds).eq("status", "published").returns<TripDb[]>(),
    supabase.from("sessions").select("id, slug, title, starts_at, ends_at, trip_id, trip_order, cover_path, venues(name, cover_path)").in("trip_id", tripIds).neq("status", "cancelled").returns<SessionDb[]>(),
    bookingIds.length ? supabase.from("trip_payments").select("booking_id, kind, amount, received_on, voided_at").in("booking_id", bookingIds) : Promise.resolve({ data: [] as { booking_id: string; kind: TripPaymentKind; amount: number; received_on: string; voided_at: string | null }[] }),
    supabase.from("trip_rundown_items").select("trip_id, day, time_label, title, location, session_id, sort").in("trip_id", tripIds).order("day").order("sort"),
  ]);
  const today = todayWib();
  const mine = new Set(sessionIds);

  return (trips ?? []).map((t) => {
    const booking = (bookings ?? []).find((b) => b.trip_id === t.id);
    const all = (sessions ?? []).filter((s) => s.trip_id === t.id).sort((a, b) => (a.trip_order ?? 99) - (b.trip_order ?? 99) || a.starts_at.localeCompare(b.starts_at));
    const order = new Map(all.map((s, i) => [s.id, i + 1]));
    const activities = all
      .filter((s) => booking || mine.has(s.id))
      .map((s) => ({ slug: mine.has(s.id) ? s.slug : null, order: order.get(s.id)!, title: s.title, venue: s.venues?.name ?? "", day: wibParts(s.starts_at).date, start: wibParts(s.starts_at).time, end: wibParts(s.ends_at).time }));
    const bySession = new Map(all.map((s) => [s.id, s]));
    const items =
      booking && t.show_rundown
        ? (rundown ?? [])
            .filter((r) => r.trip_id === t.id)
            .map((r) => {
              const s = r.session_id ? bySession.get(r.session_id as string) : undefined;
              return { day: r.day as string, time: r.time_label as string, title: r.title as string, location: r.location as string, activity: s ? { slug: mine.has(s.id) ? s.slug : null, order: order.get(s.id)! } : null };
            })
        : [];
    const pays = (payments ?? []).filter((p) => booking && p.booking_id === booking.id).map((p) => ({ amount: p.amount, receivedOn: p.received_on, voided: Boolean(p.voided_at) }));
    const pricing = { priceNormal: t.price_normal, priceEarlyBird: t.price_early_bird, earlyBirdUntil: t.early_bird_until };
    return {
      slug: t.slug,
      title: t.title,
      description: t.description,
      area: t.area,
      startsOn: t.starts_on,
      endsOn: t.ends_on,
      image: t.cover_path || all[0]?.cover_path || all[0]?.venues?.cover_path || TRIP_PLACEHOLDER,
      inclusions: booking ? t.inclusions : [],
      package: booking ? { ...bookingMoney(pricing, pays, today), due: shortDate(settlementDue(t.starts_on)) } : null,
      activities,
      rundown: items,
      next: nextAgenda(items, activities, today),
      adminWa: ADMIN_WA,
    };
  });
});

export async function getMyTrip(slug: string): Promise<MemberTrip | null> {
  return (await getMyTrips()).find((t) => t.slug === slug) ?? null;
}
