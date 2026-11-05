import "server-only";
import { cache } from "react";
import { bookingMoney, settlementDue, todayWib, type TripPaymentKind } from "@/lib/trips";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset, type Dataset } from "./dataset";
import { toRow } from "./session-rows";
import { demoTrip, demoTripBookings, demoTripRundown } from "./trip-demo";
import type { TripActivity, TripBooking, TripDetail, TripStatus, TripSummary } from "./types";

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

const PLACEHOLDER = "/images/activity/featured-altitude.webp";

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
  return { ...raw, image: raw.coverPath || activities[0]?.image || PLACEHOLDER, activities, bookings };
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
  const paymentsOf = new Map<string, PaymentRowDb[]>();
  for (const p of payments.data ?? []) paymentsOf.set(p.booking_id, [...(paymentsOf.get(p.booking_id) ?? []), p]);
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
    rundown: (rundown.data ?? []).filter((r) => r.trip_id === t.id).map((r) => ({ id: r.id, day: r.day, time: r.time_label, title: r.title, location: r.location, sessionId: r.session_id })),
    bookings: (bookings.data ?? [])
      .filter((b) => b.trip_id === t.id)
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
  const active = t.bookings.filter((b) => !b.cancelled);
  const unpaid = active.filter((b) => b.money.status !== "paid");
  return {
    sold: active.length,
    earlyBird: active.filter((b) => b.money.plan === "early_bird").length,
    normal: active.filter((b) => b.money.plan === "normal").length,
    singles: t.activities.reduce((sum, a) => sum + a.singles, 0),
    unpaid: unpaid.length,
    paidIn: active.reduce((sum, b) => sum + b.money.paid, 0),
    outstanding: unpaid.reduce((sum, b) => sum + b.money.remaining, 0),
    fullyPaid: active.length - unpaid.length,
    dp: active.filter((b) => b.money.status === "dp").length,
    notPaid: active.filter((b) => b.money.status === "unpaid").length,
    venues: new Set(t.activities.map((a) => a.venueName)).size,
  };
}

/** Status tampilan trip: draft · published · selesai (lewat tanggal selesai) · arsip. */
export function tripDisplayStatus(t: TripDetail, today: string): TripStatus {
  if (t.status === "draft" || t.status === "cancelled") return t.status;
  return t.endsOn < today ? "completed" : "published";
}

export { settlementDue };

const STATUS_LABEL: Record<string, string> = { published: "Published", draft: "Draft", scheduled: "Terjadwal", completed: "Selesai", full: "Penuh", almost_full: "Hampir penuh", cancelled: "Dibatalkan" };
const wibPart = (d: Date, from: number, to: number) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(from, to);

/** Sesi yang bisa diambil ke trip (modal 05x-5): belum dibatalkan / selesai; yang sudah di trip lain ditandai. */
export async function tripCandidates(tripId: string | null): Promise<import("@/components/admin/activities/TripEditor").TripCandidate[]> {
  const d = await getDataset();
  const trips = await listTripDetails();
  const titleOf = new Map(trips.map((t) => [t.id, t.title]));
  return d.sessions
    .filter((s) => s.status !== "cancelled" && s.status !== "completed" && s.endsAt > d.now && s.tripId !== tripId)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 300)
    .map((s) => {
      const row = toRow(d, s);
      return {
        id: s.id,
        title: s.title,
        typeLabel: row.typeLabel,
        date: wibPart(s.startsAt, 0, 10),
        start: wibPart(s.startsAt, 11, 16),
        end: wibPart(s.endsAt, 11, 16),
        venueName: s.venueName,
        capacity: s.capacity,
        booked: row.booked,
        price: s.price,
        statusLabel: STATUS_LABEL[row.displayStatus] ?? row.displayStatus,
        kuyUrl: s.kuyUrl ?? "",
        otherTrip: s.tripId ? (titleOf.get(s.tripId) ?? "trip lain") : null,
      };
    });
}
