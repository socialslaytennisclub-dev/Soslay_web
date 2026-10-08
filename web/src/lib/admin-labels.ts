import type { BookingStatus, MemberStatus, OrderStatus, PaymentStatus, TennisLevel, Tier } from "@/server/admin/types";

/** Label tampilan admin (Bahasa Indonesia) untuk nilai enum database. */

export const TIER_LABEL: Record<Tier, string> = { basic: "Basic", silver: "Silver", gold: "Gold", platinum: "Platinum" };

export const LEVEL_LABEL: Record<TennisLevel, string> = {
  beginner: "Beginner",
  beginner_intermediate: "Beg–Intermediate",
  intermediate: "Intermediate",
  intermediate_advanced: "Int–Advanced",
  advanced: "Advanced",
};

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = { active: "Aktif", inactive: "Tidak aktif", suspended: "Ditangguhkan" };

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  registered: "Terdaftar",
  waitlisted: "Waitlist",
  cancelled: "Batal",
  attended: "Hadir",
  no_show: "No-show",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { pending: "Menunggu", paid: "Lunas", failed: "Gagal", refunded: "Refund" };

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Belum",
  processing: "Perlu dikirim",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const rupiah = new Intl.NumberFormat("id-ID");

/** 48600000 → "Rp48,6 jt" · 1200000 → "Rp1,2 jt" · 220000 → "Rp220.000". */
export function formatRupiahShort(value: number): string {
  if (value >= 1_000_000) {
    return `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  return `Rp${rupiah.format(value)}`;
}

export function formatRupiahPlain(value: number): string {
  return `Rp${rupiah.format(value)}`;
}

const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** ISO → "27 Sep". */
export function formatShortDate(iso: string | null): string {
  return iso ? shortDate.format(new Date(iso)).replace(".", "") : "—";
}
