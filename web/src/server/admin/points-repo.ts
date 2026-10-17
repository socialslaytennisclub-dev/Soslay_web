import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset, type Dataset } from "./dataset";
import { TIERS } from "./demo-data";
import { DAY, monthKey, WIB } from "./time";
import type {
  AdminRedemption,
  AdminReward,
  LedgerEntry,
  PointRules,
  PointsOverview,
  PointsReason,
  RedemptionStatus,
  RewardCategory,
  Tier,
  TierBenefits,
} from "./types";

/**
 * Data admin Slay Point & Reward (Figma 316:2 · 317:37 · 317:482 · 322:2).
 * Live → tabel rewards / reward_redemptions / points_ledger / app_settings.
 * Demo → katalog contoh + riwayat poin yang diturunkan dari booking & order demo.
 */

export const DEFAULT_RULES: PointRules = {
  attendance: { "weekly-mabar": 50, "beginner-coaching": 50, social: 50, "match-day": 100, "tennis-escape": 150 },
  checkInOnly: true,
  rupiahPerPoint: 10_000,
  discountedProducts: false,
  redeemDiscount: { enabled: true, rupiahPerPoint: 100, maxPercent: 20 },
  bonuses: [
    { key: "signup", points: 100, enabled: true },
    { key: "birthday", points: 200, enabled: true },
    { key: "referral", points: 150, enabled: true },
    { key: "testimonial", points: 50, enabled: true },
    { key: "streak", points: 100, enabled: false },
  ],
  expiry: { months: 12, remind: true, tierKeeps: true },
};

const DEFAULT_BENEFITS: Record<Tier, string[]> = {
  basic: ["Akses semua sesi", "Poin kehadiran & belanja", "Info event lebih dulu"],
  silver: ["Semua benefit Basic", "Diskon Shop 5%", "Booking 24 jam lebih awal"],
  gold: ["Semua benefit Silver", "Diskon Shop 10%", "1× sesi gratis / bulan", "Merch eksklusif Gold"],
  platinum: ["Semua benefit Gold", "Diskon Shop 15%", "Prioritas Tennis Escape", "Welcome kit + jersey nama"],
};

// ── Demo ────────────────────────────────────────────────────────────────────
type RewardRow = {
  id: string; name: string; description: string | null; category: RewardCategory; image: string | null;
  points_cost: number; stock: number | null; min_tier: Tier; is_active: boolean;
};
type RedemptionRow = {
  code: string; member_id: string; reward_id: string; points: number; status: RedemptionStatus; note: string | null;
  created_at: string; handled_at: string | null; staff_members: { full_name: string } | null;
};

const DEMO_REWARDS: RewardRow[] = [
  { id: "r1", name: "Kaos A Piece of Bali", description: "Kaos katun Soslay edisi Bali, semua ukuran.", category: "merch", image: "/images/home/product-a-piece-of-bali.webp", points_cost: 1500, stock: 24, min_tier: "basic", is_active: true },
  { id: "r2", name: "Gratis 1× Weekly MABAR", description: "Voucher satu sesi Weekly MABAR di venue mana saja.", category: "session", image: "/images/home/hero.webp", points_cost: 800, stock: null, min_tier: "basic", is_active: true },
  { id: "r3", name: "Voucher Shop Rp50.000", description: "Potongan belanja Shop, berlaku 30 hari.", category: "voucher", image: null, points_cost: 450, stock: null, min_tier: "basic", is_active: true },
  { id: "r4", name: "Private coaching 60 menit", description: "Sesi privat dengan coach Soslay, jadwal menyesuaikan.", category: "session", image: "/images/home/venue-raffles.webp", points_cost: 3000, stock: 6, min_tier: "silver", is_active: true },
  { id: "r5", name: "Tote bag Slay Club", description: "Tote kanvas tebal untuk raket & perlengkapan.", category: "merch", image: null, points_cost: 900, stock: 3, min_tier: "basic", is_active: true },
  { id: "r6", name: "Seat Tennis Escape Bali", description: "Potongan Rp1.000.000 untuk trip Tennis Escape berikutnya.", category: "experience", image: "/images/home/venue-kula-mani.webp", points_cost: 7500, stock: 2, min_tier: "gold", is_active: true },
];

function demoRedemptions(d: Dataset): RedemptionRow[] {
  const statuses: RedemptionStatus[] = ["pending", "pending", "pending", "approved", "fulfilled", "fulfilled", "fulfilled", "rejected", "pending", "fulfilled", "approved", "fulfilled"];
  const rich = d.members.filter((m) => d.stats(m.id).pointsBalance >= 450).slice(0, statuses.length);
  return rich.map((m, i) => {
    const reward = DEMO_REWARDS[i % DEMO_REWARDS.length];
    const createdAt = new Date(d.now.getTime() - (i * 2.5 + 0.3) * DAY);
    const status = statuses[i];
    return {
      code: `RDM-${String(418 - i).padStart(4, "0")}`,
      member_id: m.id,
      reward_id: reward.id,
      points: reward.points_cost,
      status,
      note: status === "rejected" ? "Ukuran habis, poin dikembalikan" : null,
      created_at: createdAt.toISOString(),
      handled_at: status === "pending" ? null : new Date(createdAt.getTime() + 0.4 * DAY).toISOString(),
      staff_members: status === "pending" ? null : { full_name: "Rara Anindya" },
    };
  });
}

/** Riwayat poin demo: kehadiran (booking hadir) + belanja (order selesai) + penukaran. */
function demoLedger(d: Dataset): Omit<LedgerEntry, "balanceAfter">[] {
  const entries: Omit<LedgerEntry, "balanceAfter">[] = [];
  const member = (id: string) => d.memberById.get(id);
  for (const b of d.bookings) {
    if (b.status !== "attended") continue;
    const s = d.sessionById.get(b.sessionId);
    const m = member(b.memberId);
    if (!s || !m || !s.pointsPerAttendance) continue;
    entries.push({ id: `a-${b.sessionId}-${b.memberId}`, at: s.endsAt.toISOString(), memberId: m.id, memberName: m.fullName, memberTier: d.stats(m.id).tier, reason: "attendance", note: `${s.title} · ${s.venueName}`, delta: s.pointsPerAttendance, by: "Check-in" });
  }
  for (const o of d.orders) {
    const m = member(o.memberId);
    const pts = Math.floor(o.total / DEFAULT_RULES.rupiahPerPoint);
    if (o.status !== "completed" || !m || pts <= 0) continue;
    entries.push({ id: `o-${o.code}`, at: o.placedAt.toISOString(), memberId: m.id, memberName: m.fullName, memberTier: d.stats(m.id).tier, reason: "purchase", note: `Belanja #${o.code}`, delta: pts, by: "Sistem" });
  }
  for (const r of demoRedemptions(d)) {
    const m = member(r.member_id);
    if (!m || (r.status !== "approved" && r.status !== "fulfilled")) continue;
    const reward = DEMO_REWARDS.find((x) => x.id === r.reward_id)!;
    entries.push({ id: `r-${r.code}`, at: r.handled_at!, memberId: m.id, memberName: m.fullName, memberTier: d.stats(m.id).tier, reason: "redeem", note: `Tukar ${reward.name} (#${r.code})`, delta: -r.points, by: "Rara" });
  }
  return entries;
}

// ── Pemuat bersama ──────────────────────────────────────────────────────────
const loadRewards = cache(async (): Promise<RewardRow[]> => {
  const d = await getDataset();
  if (!d.live) return DEMO_REWARDS;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rewards")
    .select("id, name, description, category, image, points_cost, stock, min_tier, is_active")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Gagal memuat reward: ${error.message}`);
  return (data ?? []) as RewardRow[];
});

const loadRedemptions = cache(async (): Promise<RedemptionRow[]> => {
  const d = await getDataset();
  if (!d.live) return demoRedemptions(d);
  const supabase = await createSupabaseServerClient();
  const columns = "code, member_id, reward_id, points, status, note, created_at, handled_at, staff_members(full_name)";
  // Semua yang masih menunggu (antrean tidak boleh terpotong) + 500 riwayat terbaru.
  const [pending, recent] = await Promise.all([
    supabase.from("reward_redemptions").select(columns).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("reward_redemptions").select(columns).neq("status", "pending").order("created_at", { ascending: false }).limit(500),
  ]);
  const error = pending.error ?? recent.error;
  if (error) throw new Error(`Gagal memuat penukaran: ${error.message}`);
  const rows = [...(pending.data ?? []), ...(recent.data ?? [])] as unknown as RedemptionRow[];
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
});

const isRedeemed = (s: RedemptionStatus) => s === "approved" || s === "fulfilled";

// ── KPI ─────────────────────────────────────────────────────────────────────
export async function getPointsOverview(): Promise<PointsOverview> {
  const d = await getDataset();
  const [rewards, redemptions] = await Promise.all([loadRewards(), loadRedemptions()]);
  const thisMonth = monthKey(d.now);
  const wib = new Date(d.now.getTime() + WIB);
  const prevMonth = monthKey(new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 15)));
  const done = redemptions.filter((r) => isRedeemed(r.status));
  const inMonth = (key: string) => done.filter((r) => monthKey(new Date(r.created_at)) === key);
  const current = inMonth(thisMonth);
  const previous = inMonth(prevMonth).length;
  const pending = redemptions.filter((r) => r.status === "pending");
  return {
    circulating: d.members.reduce((sum, m) => sum + Math.max(0, d.stats(m.id).pointsBalance), 0),
    redeemedThisMonth: current.reduce((sum, r) => sum + r.points, 0),
    redemptionsThisMonth: current.length,
    redemptionsDelta: previous ? Math.round(((current.length - previous) / previous) * 100) : null,
    activeRewards: rewards.filter((r) => r.is_active).length,
    lowStock: rewards.filter((r) => r.is_active && r.stock !== null && r.stock <= 3).length,
    pending: pending.length,
    pendingOverdue: pending.filter((r) => d.now.getTime() - new Date(r.created_at).getTime() > DAY).length,
  };
}

// ── Katalog ─────────────────────────────────────────────────────────────────
export async function listRewards(): Promise<AdminReward[]> {
  const [rewards, redemptions] = await Promise.all([loadRewards(), loadRedemptions()]);
  return rewards.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    category: r.category,
    image: r.image,
    pointsCost: r.points_cost,
    stock: r.stock,
    minTier: r.min_tier,
    active: r.is_active,
    redeemed: redemptions.filter((x) => x.reward_id === r.id && isRedeemed(x.status)).length,
  }));
}

export function emptyReward(): AdminReward {
  return { id: "", name: "", description: "", category: "merch", image: null, pointsCost: 500, stock: null, minTier: "basic", active: true, redeemed: 0 };
}

// ── Penukaran ───────────────────────────────────────────────────────────────
export async function listRedemptions(): Promise<AdminRedemption[]> {
  const d = await getDataset();
  const [rewards, redemptions] = await Promise.all([loadRewards(), loadRedemptions()]);
  const rewardById = new Map(rewards.map((r) => [r.id, r]));
  return redemptions.map((r) => {
    const m = d.memberById.get(r.member_id);
    const reward = rewardById.get(r.reward_id);
    return {
      code: r.code,
      memberId: r.member_id,
      memberName: m?.fullName ?? "Member dihapus",
      memberCode: m?.memberCode ?? "",
      memberTier: d.stats(r.member_id).tier,
      memberBalance: d.stats(r.member_id).pointsBalance,
      rewardName: reward?.name ?? "Reward dihapus",
      rewardImage: reward?.image ?? null,
      points: r.points,
      status: r.status,
      note: r.note ?? "",
      createdAt: r.created_at,
      handledAt: r.handled_at,
      handledBy: r.staff_members?.full_name ?? null,
    };
  });
}

// ── Aturan ──────────────────────────────────────────────────────────────────
export async function getPointRules(): Promise<PointRules> {
  const d = await getDataset();
  if (!d.live) return DEFAULT_RULES;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["points_rules", "rupiah_per_point"]);
  const value = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]));
  const saved = (value.get("points_rules") as Partial<PointRules> | undefined) ?? {};
  return {
    ...DEFAULT_RULES,
    ...saved,
    attendance: { ...DEFAULT_RULES.attendance, ...saved.attendance },
    // Bonus baru di kode tetap tampil walau belum pernah disimpan.
    bonuses: DEFAULT_RULES.bonuses.map((b) => saved.bonuses?.find((x) => x.key === b.key) ?? b),
    rupiahPerPoint: Number(value.get("rupiah_per_point") ?? DEFAULT_RULES.rupiahPerPoint),
  };
}

/** Default Slay Point per tipe sesi (editor sesi baru). */
export async function attendancePointDefaults(): Promise<Record<string, number>> {
  return (await getPointRules()).attendance;
}

// ── Tier ────────────────────────────────────────────────────────────────────
export async function listTierBenefits(): Promise<TierBenefits[]> {
  const d = await getDataset();
  const count = (tier: Tier) => d.members.filter((m) => d.stats(m.id).tier === tier && m.status !== "suspended").length;
  let rows: { tier: Tier; label: string; min_points: number; benefits: string[] }[] = TIERS.map((t) => ({ tier: t.tier, label: t.label, min_points: t.minPoints, benefits: DEFAULT_BENEFITS[t.tier] }));
  if (d.live) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("membership_tiers").select("tier, label, min_points, benefits").order("sort_order");
    if (data?.length) rows = data as typeof rows;
  }
  return rows.map((t) => ({ tier: t.tier, label: t.label, minPoints: t.min_points, benefits: t.benefits ?? [], members: count(t.tier) }));
}

// ── Riwayat poin ────────────────────────────────────────────────────────────
export const LEDGER_PAGE = 50;

type LedgerRow = {
  id: number; member_id: string; delta: number; reason: PointsReason; note: string | null; booking_id: string | null;
  created_at: string; staff_members: { full_name: string } | null;
};

/** Transaksi terbaru (semua alasan) + saldo setelah tiap transaksi. */
const loadLedger = cache(async (): Promise<{ entries: LedgerEntry[]; total: number }> => {
  const d = await getDataset();
  if (!d.live) {
    const sorted = demoLedger(d).sort((a, b) => a.at.localeCompare(b.at));
    const running = new Map<string, number>();
    const entries = sorted.map((e) => {
      const balanceAfter = (running.get(e.memberId) ?? 0) + e.delta;
      running.set(e.memberId, balanceAfter);
      return { ...e, balanceAfter };
    });
    return { entries: entries.reverse(), total: entries.length };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("points_ledger")
    .select("id, member_id, delta, reason, note, booking_id, created_at, staff_members(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Gagal memuat riwayat poin: ${error.message}`);
  // Baris terbaru diambil utuh → saldo setelah transaksi = saldo sekarang − transaksi yang lebih baru.
  const newer = new Map<string, number>();
  const entries = ((data ?? []) as unknown as LedgerRow[]).map((row) => {
    const m = d.memberById.get(row.member_id);
    const later = newer.get(row.member_id) ?? 0;
    newer.set(row.member_id, later + row.delta);
    return {
      id: String(row.id),
      at: row.created_at,
      memberId: row.member_id,
      memberName: m?.fullName ?? "Member dihapus",
      memberTier: d.stats(row.member_id).tier,
      reason: row.reason,
      note: row.note ?? "",
      delta: row.delta,
      balanceAfter: d.stats(row.member_id).pointsBalance - later,
      by: row.staff_members?.full_name.split(" ")[0] ?? (row.booking_id ? "Check-in" : "Sistem"),
    };
  });
  return { entries, total: count ?? entries.length };
});

export async function listLedger(reason?: PointsReason, limit = LEDGER_PAGE): Promise<{ entries: LedgerEntry[]; total: number; matching: number }> {
  const { entries, total } = await loadLedger();
  const filtered = reason ? entries.filter((e) => e.reason === reason) : entries;
  return { entries: filtered.slice(0, limit), total, matching: filtered.length };
}

/** Untuk Export CSV. */
export async function exportLedger(reason?: PointsReason): Promise<LedgerEntry[]> {
  return (await listLedger(reason, Infinity)).entries;
}

/** Badge sidebar: penukaran yang menunggu diproses. */
export async function pendingRedemptionCount(): Promise<number> {
  // Badge saja — jangan sampai gagal memuat penukaran membuat seluruh admin error.
  try {
    return (await loadRedemptions()).filter((r) => r.status === "pending").length;
  } catch {
    return 0;
  }
}
