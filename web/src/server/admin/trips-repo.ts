import "server-only";
import { cache } from "react";
import { SESSION_STATUS_LABEL } from "@/lib/admin-labels";
import { wibParts } from "@/lib/format";
import { bookingMoney, todayWib, TRIP_PLACEHOLDER, type TripPaymentKind } from "@/lib/trips";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset, type Dataset } from "./dataset";
import { toRow } from "./session-rows";
import { demoTrip, demoTripBookings, demoTripRundown } from "./trip-demo";
import type { TripActivity, TripBooking, TripCandidate, TripDetail, TripStatus, TripSummary } from "./types";

/**
 * Tennis Escape = Trip (BR-22): trip + activity (sesi bertautan trip_id) + rundown + paket bundling &
 * pembayarannya. Mode demo memakai trip-demo.ts.
 */

type TripRowDb = {
  id: string; slug: string; title: string; description: string; area: string; starts_on: string; ends_on: string;
  cover_path: string | null; status: TripStatus; visibility: TripDetail["visibility"]; show_on_homepage: boolean; show_rundown: boolean;
  price_normal: number; price_early_bird: number | null; early_bird_until: string | null; package_quota: number; min_dp: number; inclusions: string[];
};
type BookingRowDb = { id: string; trip_id: string; member_id: string | null; full_name: string; phone: string | null; email: string | null; created_at: string; cancelled_at: string | null };
type PaymentRowDb = {
  id: string; booking_id: string; kind: TripPaymentKind; amount: number; received_on: string; account_id: string;
  proof_path: string | null; proof_name: string | null; voided_at: string | null; void_reason: string | null; created_at: string;
  finance_accounts: { name: string } | null;
};
type RundownRowDb = { id: string; trip_id: string; day: string; time_label: string; title: string; location: string; session_id: string | null; sort: number };

type RawTrip = Omit<TripDetail, "activities" | "bookings" | "image"> & { bookings: Omit<TripBooking, "money" | "memberCode">[] };

/** Activity trip dari dataset (urut nomor activity, lalu jadwal). */
function activitiesOf(d: Dataset, tripId: string): TripActivity[] {
  return d.sessions
    .filter((s) => s.tripId === tripId)
    .sort((a, b) => (a.tripOrder ?? 99) - (b.tripOrder ?? 99) || a.startsAt.getTime() - b.startsAt.getTime())
    .map((s, i) => {
      const row = toRow(d, s);
      const bundled = d.tripFilled(s.id);
      return { ...row, tripOrder: i + 1, soldSingle: s.soldSingle ?? true, singleQuota: s.singleQuota ?? null, kuyUrl: s.kuyUrl ?? "", bundled, singles: Math.max(row.booked - bundled, 0) };
    });
}

function assemble(d: Dataset, raw: RawTrip): TripDetail {
  const today = todayWib(d.now);
  const activities = activitiesOf(d, raw.id);
  const bookings = raw.bookings.map((b) => ({
    ...b,
    memberCode: b.memberId ? (d.memberById.get(b.memberId)?.memberCode ?? "") : "",
    money: bookingMoney(raw, b.payments, today),
  }));
  return { ...raw, image: raw.coverPath || activities[0]?.image || TRIP_PLACEHOLDER, activities, bookings };
}

async function loadLiveTrips(): Promise<RawTrip[]> {
  const supabase = await createSupabaseServerClient();
  const [trips, bookings, payments, rundown] = await Promise.all([
    supabase.from("trips").select("*").order("starts_on").returns<TripRowDb[]>(),
    supabase.from("trip_bookings").select("id, trip_id, member_id, full_name, phone, email, created_at, cancelled_at").order("created_at").returns<BookingRowDb[]>(),
    supabase
      .from("trip_payments")
      .select("id, booking_id, kind, amount, received_on, account_id, proof_path, proof_name, voided_at, void_reason, created_at, finance_accounts(name)")
      .order("received_on")
      .returns<PaymentRowDb[]>(),
    supabase.from("trip_rundown_items").select("id, trip_id, day, time_label, title, location, session_id, sort").order("day").order("sort").returns<RundownRowDb[]>(),
  ]);
  if (trips.error) throw new Error(`Gagal memuat trip: ${trips.error.message}`);
  // Kelompokkan sekali (bukan filter per trip / salin array per baris).
  const group = <T,>(rows: T[] | null, key: (r: T) => string) => {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const list = map.get(key(r));
      if (list) list.push(r);
      else map.set(key(r), [r]);
    }
    return map;
  };
  const paymentsOf = group(payments.data, (p) => p.booking_id);
  const rundownOf = group(rundown.data, (r) => r.trip_id);
  const bookingsOf = group(bookings.data, (b) => b.trip_id);
  return (trips.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    area: t.area,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
    coverPath: t.cover_path,
    status: t.status,
    visibility: t.visibility,
    showOnHomepage: t.show_on_homepage,
    showRundown: t.show_rundown,
    priceNormal: t.price_normal,
    priceEarlyBird: t.price_early_bird,
    earlyBirdUntil: t.early_bird_until,
    packageQuota: t.package_quota,
    minDp: t.min_dp,
    inclusions: t.inclusions ?? [],
    rundown: (rundownOf.get(t.id) ?? []).map((r) => ({ id: r.id, day: r.day, time: r.time_label, title: r.title, location: r.location, sessionId: r.session_id })),
    bookings: (bookingsOf.get(t.id) ?? [])
      .map((b) => ({
        id: b.id,
        memberId: b.member_id,
        name: b.full_name,
        phone: b.phone ?? "",
        email: b.email ?? "",
        createdAt: b.created_at,
        cancelled: Boolean(b.cancelled_at),
        payments: (paymentsOf.get(b.id) ?? []).map((p) => ({
          id: p.id,
          kind: p.kind,
          amount: p.amount,
          receivedOn: p.received_on,
          accountId: p.account_id,
          accountName: p.finance_accounts?.name ?? "Akun",
          proofName: p.proof_name,
          hasProof: Boolean(p.proof_path),
          voided: Boolean(p.voided_at),
          voidReason: p.void_reason,
          createdAt: p.created_at,
        })),
      })),
  }));
}

const demoRaw = (): RawTrip[] => [{ ...demoTrip, rundown: demoTripRundown, bookings: demoTripBookings.map((b) => ({ ...b, cancelled: false })) }];

/** Semua trip (termasuk draft & arsip), lengkap. */
export const listTripDetails = cache(async (): Promise<TripDetail[]> => {
  const d = await getDataset();
  const raw = d.live ? await loadLiveTrips() : demoRaw();
  return raw.map((t) => assemble(d, t));
});

export async function getTrip(id: string): Promise<TripDetail | null> {
  return (await listTripDetails()).find((t) => t.id === id) ?? null;
}

/** Ringkasan baris induk: paket terjual, peserta satuan, belum lunas, uang masuk & sisa tagihan. */
export function tripSummary(t: TripDetail): TripSummary {
  const s = { sold: 0, earlyBird: 0, normal: 0, unpaid: 0, paidIn: 0, outstanding: 0, fullyPaid: 0, dp: 0 };
  for (const b of t.bookings) {
    if (b.cancelled) continue;
    const m = b.money;
    s.sold++;
    s[m.plan === "early_bird" ? "earlyBird" : "normal"]++;
    s.paidIn += m.paid;
    if (m.status === "paid") s.fullyPaid++;
    else {
      s.unpaid++;
      s.outstanding += m.remaining;
      if (m.status === "dp") s.dp++;
    }
  }
  return { ...s, singles: t.activities.reduce((sum, a) => sum + a.singles, 0), venues: new Set(t.activities.map((a) => a.venueName)).size };
}

/** Status tampilan trip: draft · published · selesai (lewat tanggal selesai) · arsip. */
export function tripDisplayStatus(t: TripDetail, today: string): TripStatus {
  if (t.status === "draft" || t.status === "cancelled") return t.status;
  return t.endsOn < today ? "completed" : "published";
}


/** Sesi yang bisa diambil ke trip (modal 05x-5): belum dibatalkan / selesai; yang sudah di trip lain ditandai. */
export async function tripCandidates(tripId: string | null): Promise<TripCandidate[]> {
  const [d, trips] = await Promise.all([getDataset(), listTripDetails()]);
  const titleOf = new Map(trips.map((t) => [t.id, t.title]));
  return d.sessions
    .filter((s) => s.status !== "cancelled" && s.status !== "completed" && s.endsAt > d.now && s.tripId !== tripId)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 300)
    .map((s) => {
      const row = toRow(d, s);
      const start = wibParts(s.startsAt);
      return {
        id: s.id,
        title: s.title,
        typeLabel: row.typeLabel,
        date: start.date,
        start: start.time,
        end: wibParts(s.endsAt).time,
        venueName: s.venueName,
        capacity: s.capacity,
        booked: row.booked,
        price: s.price,
        statusLabel: SESSION_STATUS_LABEL[row.displayStatus],
        kuyUrl: s.kuyUrl ?? "",
        otherTrip: s.tripId ? (titleOf.get(s.tripId) ?? "trip lain") : null,
      };
    });
}
