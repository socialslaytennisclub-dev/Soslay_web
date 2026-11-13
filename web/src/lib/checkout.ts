/**
 * Aturan checkout Shop yang dipakai bersama browser (pratinjau ongkir), server & mode demo.
 * Angka resmi dihitung ulang database (place_shop_order) — fungsi di sini harus sama dengan
 * migrasi 20261113000000_shop_checkout.sql. Sumber: "Aturan bisnis — Shop" draft v1 (13 Nov 2026).
 */

import { describeVariant } from "@/content/products";

export type ShippingMethod = "jnt" | "instant" | "pickup";

/** Pengaturan Instant (tabel shipping_instant_settings). */
export type InstantSettings = {
  originAddress: string;
  originLat: number;
  originLng: number;
  baseFee: number;
  baseKm: number;
  perKmFee: number;
  maxKm: number;
  /** "15:00" — verifikasi sebelum jam ini → dikirim hari itu. */
  cutoff: string;
};

export const DEFAULT_INSTANT: InstantSettings = {
  originAddress: "Soslay · Kemang, Jakarta Selatan",
  originLat: -6.2607,
  originLng: 106.8136,
  baseFee: 15000,
  baseKm: 3,
  perKmFee: 3000,
  maxKm: 25,
  cutoff: "15:00",
};

/** Tarif J&T per kota tujuan (tabel shipping_rates). */
export type ShippingRate = { city: string; province: string; perKg: number; eta: string };

/** Berat → kg ongkir J&T: dibulatkan ke atas, minimal 1 kg. */
export const billableKg = (grams: number) => Math.max(1, Math.ceil(grams / 1000));

export const jntFee = (perKg: number, grams: number) => perKg * billableKg(grams);

/**
 * Perkiraan jarak rute (km, 1 desimal): garis lurus × 1,3. Google Maps Routes API belum dipasang
 * (butuh API key + billing, aturan §3.2) — sama dengan fungsi SQL shop_distance_km.
 */
export function estimateRouteKm(lat: number, lng: number, s: Pick<InstantSettings, "originLat" | "originLng"> = DEFAULT_INSTANT): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat - s.originLat) / 2) ** 2 + Math.cos(rad(s.originLat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - s.originLng) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a)) * 1.3;
  return Math.round(km * 10) / 10;
}

/** Rincian ongkir Instant: tarif dasar + (km − km dasar, dibulatkan ke atas) × tarif/km, dibulatkan ke Rp1.000. */
export function instantQuote(km: number, s: InstantSettings = DEFAULT_INSTANT) {
  const extraKm = Math.ceil(Math.max(0, km - s.baseKm));
  const fee = Math.ceil((s.baseFee + extraKm * s.perKmFee) / 1000) * 1000;
  return { km, extraKm, extraFee: extraKm * s.perKmFee, fee, tooFar: km > s.maxKm };
}

/** Perkiraan waktu tempuh motor (±3 menit/km) untuk badge di peta. */
export const etaMinutes = (km: number) => Math.max(10, Math.round(km * 3));

/** PRD: 1 Slay Point per Rp10.000 subtotal produk. */
export const pointsFor = (subtotal: number) => Math.floor(subtotal / 10000);

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export const REJECT_REASONS = [
  "Bukti tidak terbaca / terpotong",
  "Nominal tidak sesuai tagihan",
  "Dana belum masuk ke rekening",
  "Rekening tujuan salah",
  "Lainnya",
] as const;

export const MAX_REJECTIONS = 3;

export const SHIPPING_LABEL: Record<ShippingMethod, { title: string; short: string; summary: string }> = {
  jnt: { title: "J&T Express — Reguler", short: "J&T Express", summary: "J&T Reguler" },
  instant: { title: "Instant — Area Jakarta", short: "Instant · Jakarta", summary: "Instant" },
  pickup: { title: "Free Pickup di Mabar Session", short: "Pickup Mabar", summary: "Pickup Mabar" },
};

/**
 * Status pesanan untuk member & admin (aturan §1), diturunkan dari kolom database:
 * order_status + payment_status + ada/tidaknya bukti yang menunggu + jumlah penolakan.
 */
export type OrderStage =
  | "awaiting_payment"
  | "awaiting_verification"
  | "reupload"
  | "processing"
  | "shipped"
  | "ready_pickup"
  | "completed"
  | "cancelled";

export function orderStage(o: {
  status: string;
  payment: string;
  hasPendingProof: boolean;
  rejections: number;
  method: ShippingMethod | null;
}): OrderStage {
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "completed") return "completed";
  if (o.status === "shipped") return o.method === "pickup" ? "ready_pickup" : "shipped";
  if (o.status === "processing" || o.payment === "paid") return "processing";
  if (o.hasPendingProof) return "awaiting_verification";
  return o.rejections > 0 ? "reupload" : "awaiting_payment";
}

export type StageTone = "amber" | "indigo" | "red" | "lime" | "green" | "neutral";

export const STAGE: Record<OrderStage, { label: string; tone: StageTone }> = {
  awaiting_payment: { label: "Menunggu pembayaran", tone: "amber" },
  awaiting_verification: { label: "Menunggu verifikasi", tone: "indigo" },
  reupload: { label: "Perlu upload ulang", tone: "red" },
  processing: { label: "Dikemas", tone: "indigo" },
  shipped: { label: "Dikirim", tone: "indigo" },
  ready_pickup: { label: "Siap diambil", tone: "lime" },
  completed: { label: "Selesai", tone: "green" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
};

/** "Rp238.137" (format checkout Figma, tanpa titik setelah Rp). */
const idr = new Intl.NumberFormat("id-ID");
export const rp = (amount: number) => `${amount < 0 ? "-" : ""}Rp${idr.format(Math.abs(amount))}`;

const wib = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hourCycle: "h23", ...opts });
const dateFmt = wib({ day: "numeric", month: "short", year: "numeric" });
const dayDateFmt = wib({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = wib({ hour: "2-digit", minute: "2-digit" });

/** "13 Nov 2026" */
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
/** "Sab, 14 Nov 2026" */
export const fmtDayDate = (iso: string) => dayDateFmt.format(new Date(iso));
/** "15.20" */
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso)).replace(":", ".");
/** "13 Nov 2026 · 15.20" */
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)}`;

/** Batas bayar pickup: H-1 sesi pukul 21.00 WIB (sama dengan pickup_pay_deadline di SQL). */
export function pickupDeadline(startsAt: string): string {
  const day = new Date(new Date(startsAt).getTime() + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
  return new Date(`${day}T21:00:00+07:00`).toISOString();
}

/** Ukuran file: 412 KB / 1,2 MB. */
export const fmtSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/** { color: "putih", size: "L" } → "Putih · L" (label konten bila ada, kalau tidak nilai mentah). */
export function variantLabel(slug: string, options: Record<string, string>): string {
  const { color, chips } = describeVariant(slug, options ?? {});
  const labels = [color?.label, ...chips].filter(Boolean) as string[];
  return labels.length ? labels.join(" · ") : Object.values(options ?? {}).join(" · ");
}
