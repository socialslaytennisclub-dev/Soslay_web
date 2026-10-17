import type {
  BonusKey,
  BookingStatus,
  MemberStatus,
  OrderStatus,
  PaymentStatus,
  PointsReason,
  RedemptionStatus,
  RewardCategory,
  TennisLevel,
  Tier,
} from "@/server/admin/types";

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

// ── Slay Point & Reward ─────────────────────────────────────────────────────
export const REWARD_CATEGORY_LABEL: Record<RewardCategory, string> = { merch: "Merch", session: "Sesi", voucher: "Voucher", experience: "Pengalaman" };

export const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = { pending: "Menunggu", approved: "Disetujui", fulfilled: "Selesai", rejected: "Ditolak" };

export const POINTS_REASON_LABEL: Record<PointsReason, string> = { attendance: "Kehadiran", purchase: "Belanja", bonus: "Bonus", redeem: "Penukaran", adjustment: "Manual" };

export const BONUS_LABEL: Record<BonusKey, { label: string; hint: string }> = {
  signup: { label: "Member baru", hint: "Langsung setelah akun dibuat" },
  birthday: { label: "Ulang tahun", hint: "Dikirim jam 08.00 di hari ulang tahun" },
  referral: { label: "Ajak teman", hint: "Untuk kamu & teman, setelah teman hadir 1×" },
  testimonial: { label: "Testimoni disetujui", hint: "Teks atau video yang tampil di homepage" },
  streak: { label: "Streak 4 minggu", hint: "Hadir 4 minggu berturut-turut" },
};

/** "1.250 pts" / "−300 pts"; `signed` menambah "+" untuk angka positif. */
export const formatPoints = (n: number, signed = false) => `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}${Math.abs(n).toLocaleString("id-ID")} pts`;
