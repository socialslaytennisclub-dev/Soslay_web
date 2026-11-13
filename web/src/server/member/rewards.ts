import "server-only";
import { cache } from "react";
import { isPhysicalReward } from "@/lib/admin-labels";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_REWARDS } from "@/server/admin/points-repo";
import type { RedemptionStatus, RewardCategory, Tier } from "@/server/admin/types";
import { getWebsiteSessions } from "@/server/public/sessions";
import type { ShippingMethod } from "@/lib/checkout";
import { getMemberSession } from "./user";

/**
 * Katalog penukaran Slay Point untuk member (tab Dashboard › Tukar) + riwayat penukaran sendiri.
 * Penukaran lewat RPC redeem_reward (lihat migrasi 20261113020000).
 */

const TIER_RANK: Record<Tier, number> = { basic: 0, silver: 1, gold: 2, platinum: 3 };

export type MemberReward = {
  id: string;
  name: string;
  description: string;
  category: RewardCategory;
  image: string | null;
  pointsCost: number;
  /** null = tanpa batas. */
  stock: number | null;
  minTier: Tier;
  /** Tier member masih di bawah minimal. */
  locked: boolean;
  physical: boolean;
  weightGrams: number;
};

export type PickupActivity = { id: string; title: string; startsAt: string; endsAt: string; venue: string };

export type MyRedemption = {
  code: string;
  rewardName: string;
  category: RewardCategory;
  points: number;
  status: RedemptionStatus;
  createdAt: string;
  deliveryMethod: ShippingMethod | null;
  activity: PickupActivity | null;
  orderCode: string | null;
  voucherCode: string | null;
  voucherValidUntil: string | null;
  note: string | null;
};

export type RewardPage = {
  demo: boolean;
  balance: number;
  tier: Tier;
  rewards: MemberReward[];
  redemptions: MyRedemption[];
  /** Activity terbit 14 hari ke depan — pilihan "Ambil di activity". */
  activities: PickupActivity[];
};

const WINDOW_DAYS = 14;

/** Mode demo: contoh penukaran di tiap status supaya tampilan "Penukaran saya" bisa dicek tanpa Supabase. */
function demoRedemptions(now: number): MyRedemption[] {
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const inDays = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const base = { deliveryMethod: null, activity: null, orderCode: null, voucherCode: null, voucherValidUntil: null, note: null };
  return [
    { ...base, code: "RDM-0425", rewardName: "Voucher Shop Rp50.000", category: "voucher", points: 450, status: "approved", createdAt: ago(1), voucherCode: "SLAY-50K-7Q2M", voucherValidUntil: inDays(30).slice(0, 10) },
    { ...base, code: "RDM-0424", rewardName: "Gratis 1× Weekly MABAR", category: "session", points: 800, status: "pending", createdAt: ago(0.2) },
    {
      ...base,
      code: "RDM-0423",
      rewardName: "Overgrip Wilson Pro (3 pcs)",
      category: "product",
      points: 600,
      status: "approved",
      createdAt: ago(2),
      deliveryMethod: "pickup",
      activity: { id: "demo", title: "Weekly MABAR", startsAt: inDays(3), endsAt: inDays(3.1), venue: "Common Grounds Menteng" },
    },
    { ...base, code: "RDM-0422", rewardName: "Kaos A Piece of Bali", category: "merch", points: 1500, status: "pending", createdAt: ago(0.1), deliveryMethod: "jnt", orderCode: "SOS-2318" },
    { ...base, code: "RDM-0419", rewardName: "Tote bag Slay Club", category: "merch", points: 900, status: "fulfilled", createdAt: ago(9), deliveryMethod: "instant", orderCode: "SOS-2290" },
    { ...base, code: "RDM-0417", rewardName: "Seat Tennis Escape Bali", category: "experience", points: 7500, status: "rejected", createdAt: ago(12), note: "Kuota trip sudah penuh" },
  ];
}

export const getRewardPage = cache(async (): Promise<RewardPage | null> => {
  if (!isSupabaseConfigured) {
    const now = Date.now();
    const sessions = await getWebsiteSessions();
    return {
      demo: true,
      balance: 2450,
      tier: "gold",
      rewards: DEMO_REWARDS.filter((r) => r.is_active).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? "",
        category: r.category,
        image: r.image,
        pointsCost: r.points_cost,
        stock: r.stock,
        minTier: r.min_tier,
        locked: TIER_RANK.gold < TIER_RANK[r.min_tier],
        physical: isPhysicalReward(r.category),
        weightGrams: 300,
      })),
      redemptions: demoRedemptions(now),
      activities: sessions
        .map((s) => {
          const offset = s.venue.city === "Bali" ? "+08:00" : "+07:00";
          return { id: s.slug, title: s.title, startsAt: new Date(`${s.date}T${s.start}:00${offset}`).toISOString(), endsAt: new Date(`${s.date}T${s.end}:00${offset}`).toISOString(), venue: s.venue.name };
        })
        .filter((a) => new Date(a.startsAt).getTime() > now && new Date(a.startsAt).getTime() < now + WINDOW_DAYS * 86_400_000)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
  }

  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  const now = new Date();
  const [{ data: profile }, { data: stats }, { data: rewards }, { data: redemptions }, { data: sessions }] = await Promise.all([
    supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle(),
    supabase.from("member_stats").select("points_balance").eq("member_id", user.id).maybeSingle(),
    supabase.from("rewards").select("id, name, description, category, image, points_cost, stock, min_tier, weight_grams").eq("is_active", true).order("sort_order").order("points_cost"),
    supabase
      .from("reward_redemptions")
      .select("code, points, status, created_at, delivery_method, voucher_code, voucher_valid_until, note, rewards(name, category), orders(code), sessions(id, title, starts_at, ends_at, venues(name))")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sessions")
      .select("id, title, starts_at, ends_at, venues(name)")
      .eq("status", "published")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + WINDOW_DAYS * 86_400_000).toISOString())
      .order("starts_at"),
  ]);
  const tier = ((profile?.tier as Tier | undefined) ?? "basic") as Tier;

  type SessionRow = { id: string; title: string; starts_at: string; ends_at: string; venues: { name: string } | null };
  const toActivity = (s: SessionRow): PickupActivity => ({ id: s.id, title: s.title, startsAt: s.starts_at, endsAt: s.ends_at, venue: s.venues?.name ?? "" });
  type RedemptionRow = {
    code: string;
    points: number;
    status: RedemptionStatus;
    created_at: string;
    delivery_method: ShippingMethod | null;
    voucher_code: string | null;
    voucher_valid_until: string | null;
    note: string | null;
    rewards: { name: string; category: RewardCategory } | null;
    orders: { code: string } | null;
    sessions: SessionRow | null;
  };

  return {
    demo: false,
    balance: Number(stats?.points_balance ?? 0),
    tier,
    rewards: (rewards ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? "",
      category: r.category as RewardCategory,
      image: r.image as string | null,
      pointsCost: r.points_cost as number,
      stock: r.stock as number | null,
      minTier: r.min_tier as Tier,
      locked: TIER_RANK[tier] < TIER_RANK[r.min_tier as Tier],
      physical: isPhysicalReward(r.category as RewardCategory),
      weightGrams: (r.weight_grams as number | null) ?? 300,
    })),
    redemptions: ((redemptions ?? []) as unknown as RedemptionRow[]).map((r) => ({
      code: r.code,
      rewardName: r.rewards?.name ?? "Reward",
      category: r.rewards?.category ?? "voucher",
      points: r.points,
      status: r.status,
      createdAt: r.created_at,
      deliveryMethod: r.delivery_method,
      activity: r.sessions ? toActivity(r.sessions) : null,
      orderCode: r.orders?.code ?? null,
      voucherCode: r.voucher_code,
      voucherValidUntil: r.voucher_valid_until,
      note: r.note,
    })),
    activities: ((sessions ?? []) as unknown as SessionRow[]).map(toActivity),
  };
});
