import "server-only";
import type { TripPaymentKind } from "@/lib/trips";
import { DEMO_TRIP_BUNDLE, DEMO_TRIP_ID } from "./demo-data";

/**
 * Mode demo: trip "Rally in Paradise · Bali" (Figma 05x / 05x-2) — 10 paket bundling (6 early bird,
 * 4 normal; 7 lunas, 2 DP, 1 belum bayar) dan rundown 3 hari. Activity-nya ada di demo-data.ts.
 */

export const demoTrip = {
  id: DEMO_TRIP_ID,
  slug: "rally-in-paradise-bali",
  title: "Rally in Paradise · Bali",
  description: "3 hari main tennis di 4 court terbaik Bali — Ubud, Kintamani & Sanur — plus villa, transport, makan bareng dan jersey trip.",
  area: "Bali · Ubud, Kintamani, Sanur",
  startsOn: "2026-10-17",
  endsOn: "2026-10-19",
  coverPath: null as string | null,
  status: "published" as const,
  visibility: "public" as const,
  showOnHomepage: true,
  showRundown: true,
  priceNormal: 3_500_000,
  priceEarlyBird: 3_200_000,
  earlyBirdUntil: "2026-08-31",
  packageQuota: 12,
  minDp: 1_500_000,
  inclusions: ["4 activity / court", "Villa 2 malam", "Transport selama trip", "Makan 3 hari", "Jersey trip", "Fotografer & video"],
};

type DemoPay = { kind: TripPaymentKind; amount: number; on: string };
const full = (on: string, price: number): DemoPay[] => [
  { kind: "dp", amount: 1_500_000, on },
  { kind: "settlement", amount: price - 1_500_000, on: on < "2026-09-01" ? "2026-09-12" : "2026-09-28" },
];
// [tanggal daftar, pembayaran]
const PLAN: [string, DemoPay[]][] = [
  ["2026-08-18", full("2026-08-20", 3_200_000)],
  ["2026-08-20", full("2026-08-22", 3_200_000)],
  ["2026-08-26", [{ kind: "dp", amount: 1_500_000, on: "2026-08-28" }]],
  ["2026-09-03", [{ kind: "dp", amount: 1_500_000, on: "2026-09-05" }]],
  ["2026-09-22", []],
  ["2026-09-10", [{ kind: "settlement", amount: 3_500_000, on: "2026-09-15" }]],
  ["2026-08-10", full("2026-08-12", 3_200_000)],
  ["2026-08-14", full("2026-08-15", 3_200_000)],
  ["2026-08-25", full("2026-08-29", 3_200_000)],
  ["2026-09-08", full("2026-09-10", 3_500_000)],
];

export const demoTripBookings = DEMO_TRIP_BUNDLE.map((m, i) => ({
  id: `${DEMO_TRIP_ID}-b${i + 1}`,
  memberId: m.id,
  name: m.fullName,
  phone: m.phone,
  email: m.email,
  createdAt: `${PLAN[i][0]}T10:00:00+07:00`,
  payments: PLAN[i][1].map((p, j) => ({
    id: `${DEMO_TRIP_ID}-b${i + 1}-p${j + 1}`,
    kind: p.kind,
    amount: p.amount,
    receivedOn: p.on,
    accountId: "acc-bca",
    accountName: "Bank BCA",
    proofName: null,
    hasProof: false,
    voided: false,
    voidReason: null,
    createdAt: `${p.on}T12:00:00+07:00`,
  })),
}));

export const demoTripRundown = [
  { day: "2026-10-17", time: "05.30", title: "Penjemputan di hotel / bandara Ngurah Rai", location: "Bali", session: null },
  { day: "2026-10-17", time: "07.00 – 10.00", title: "Lapangan Maya Ubud", location: "Kula Mani Tennis Village", session: 1 },
  { day: "2026-10-17", time: "12.00", title: "Makan siang bersama", location: "Ubud", session: null },
  { day: "2026-10-17", time: "15.00", title: "Check-in villa", location: "Villa Ubud", session: null },
  { day: "2026-10-17", time: "19.00", title: "Welcome dinner & pembagian jersey", location: "Villa Ubud", session: null },
  { day: "2026-10-18", time: "06.30 – 09.30", title: "Altitude Kintamani", location: "Altitude Kintamani", session: 2 },
  { day: "2026-10-18", time: "16.00 – 19.00", title: "Ubud Tennis Club", location: "Kula Mani Tennis Village", session: 3 },
  { day: "2026-10-19", time: "07.00 – 10.00", title: "Sanur Beach Court", location: "Swan Paradise Pramana", session: 4 },
  { day: "2026-10-19", time: "12.00", title: "Check-out & antar ke bandara", location: "Sanur", session: null },
].map((r, i) => ({ id: `${DEMO_TRIP_ID}-r${i + 1}`, day: r.day, time: r.time, title: r.title, location: r.location, sessionId: r.session ? `${DEMO_TRIP_ID}-a${r.session}` : null }));
