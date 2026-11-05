/**
 * Tennis Escape = Trip (BR-22): aturan paket bundling yang dipakai admin & member. Murni (tanpa I/O).
 *
 * - Harga paket: early bird bila DP pertama masuk ≤ batas early bird, selain itu normal. Belum bayar →
 *   menurut hari ini (bisa berubah sampai DP pertama masuk; sesudahnya terkunci).
 * - Status: Lunas (dibayar ≥ harga) · DP (sudah ada pembayaran) · Belum bayar.
 * - Pelunasan jatuh tempo H-14 sebelum tanggal mulai trip.
 */

export type TripPaymentKind = "dp" | "installment" | "settlement";
export type TripPlan = "early_bird" | "normal";
export type TripPayStatus = "paid" | "dp" | "unpaid";

export type TripPricing = {
  priceNormal: number;
  priceEarlyBird: number | null;
  /** YYYY-MM-DD (WIB) — DP pertama ≤ tanggal ini → harga early bird. */
  earlyBirdUntil: string | null;
};

export type TripPaymentLike = { amount: number; receivedOn: string; voided: boolean };

export const PAYMENT_KIND_LABEL: Record<TripPaymentKind, string> = { dp: "DP", installment: "Cicilan", settlement: "Pelunasan" };
export const PLAN_LABEL: Record<TripPlan, string> = { early_bird: "Early bird", normal: "Normal" };
export const PAY_STATUS_LABEL: Record<TripPayStatus, string> = { paid: "Lunas", dp: "DP", unpaid: "Belum bayar" };

/** Hari ini di WIB (YYYY-MM-DD). */
export const todayWib = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** Tanggal (YYYY-MM-DD) ± n hari. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Jatuh tempo pelunasan: H-14 sebelum trip mulai. */
export const settlementDue = (startsOn: string) => addDays(startsOn, -14);

/** Paket & harga satu pembeli. */
export function planFor(pricing: TripPricing, payments: TripPaymentLike[], today: string): { plan: TripPlan; price: number; locked: boolean } {
  const first = payments
    .filter((p) => !p.voided)
    .map((p) => p.receivedOn)
    .sort()[0];
  const when = first ?? today;
  const early = pricing.priceEarlyBird !== null && pricing.earlyBirdUntil !== null && when <= pricing.earlyBirdUntil;
  return { plan: early ? "early_bird" : "normal", price: early ? pricing.priceEarlyBird! : pricing.priceNormal, locked: Boolean(first) };
}

export type BookingMoney = { plan: TripPlan; price: number; paid: number; remaining: number; status: TripPayStatus; locked: boolean };

export function bookingMoney(pricing: TripPricing, payments: TripPaymentLike[], today: string): BookingMoney {
  const { plan, price, locked } = planFor(pricing, payments, today);
  const paid = payments.filter((p) => !p.voided).reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(price - paid, 0);
  return { plan, price, paid, remaining, locked, status: paid >= price && price > 0 ? "paid" : paid > 0 ? "dp" : "unpaid" };
}

/** Jumlah hari (inklusif) trip: 17–19 Okt → 3. */
export const tripDays = (startsOn: string, endsOn: string) => Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;

/** Daftar tanggal trip (YYYY-MM-DD). */
export const tripDates = (startsOn: string, endsOn: string) => Array.from({ length: Math.max(tripDays(startsOn, endsOn), 1) }, (_, i) => addDays(startsOn, i));

const dayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayNumFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" });
const yearFmt = new Intl.DateTimeFormat("id-ID", { year: "numeric", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
const clean = (s: string) => s.replace(/\./g, "");
const at = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Jum, 17 Okt" */
export const dayLabel = (day: string) => clean(dayFmt.format(at(day)));
/** "17 Okt" */
export const shortDate = (day: string) => `${dayNumFmt.format(at(day))} ${clean(monthFmt.format(at(day)))}`;
/** "Jum" */
export const weekday = (day: string) => clean(weekdayFmt.format(at(day)));

/** "17–19 Okt 2026" (bulan sama) / "30 Okt – 2 Nov 2026". */
export function tripRange(startsOn: string, endsOn: string, withYear = true): string {
  const year = withYear ? ` ${yearFmt.format(at(endsOn))}` : "";
  if (startsOn === endsOn) return `${shortDate(startsOn)}${year}`;
  if (startsOn.slice(0, 7) === endsOn.slice(0, 7)) return `${dayNumFmt.format(at(startsOn))}–${shortDate(endsOn)}${year}`;
  return `${shortDate(startsOn)} – ${shortDate(endsOn)}${year}`;
}

/** "Jum–Min" */
export const weekdayRange = (startsOn: string, endsOn: string) => (startsOn === endsOn ? weekday(startsOn) : `${weekday(startsOn)}–${weekday(endsOn)}`);

/** "Rp3,2 jt" */
export const rupiahShort = (n: number) => (n >= 1_000_000 ? `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : n >= 1000 ? `Rp${Math.round(n / 1000)}rb` : `Rp${n}`);

/** Template pengingat pelunasan (wa.me, dikirim manual oleh admin — BR-20). */
export function reminderText(name: string, tripTitle: string, remaining: string, due: string) {
  return `Halo ${name.split(" ")[0]}, ini dari Soslay. Pengingat pelunasan paket ${tripTitle}: sisa ${remaining}, jatuh tempo ${due}. Transfer ke rekening Soslay lalu kirim buktinya di sini ya. Terima kasih!`;
}
