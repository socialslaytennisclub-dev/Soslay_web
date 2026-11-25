import { supabase } from "./supabase";

/** Data member dari Supabase yang sama dengan web: tier, Slay Point, dan activity Social Slay. */
export type Tier = "basic" | "silver" | "gold" | "platinum";
export const TIER_LABEL: Record<Tier, string> = { basic: "Basic", silver: "Silver", gold: "Gold", platinum: "Platinum" };

export type MemberSummary = {
  name: string;
  initials: string;
  tier: Tier;
  points: number;
  earned: number;
  nextTier: { label: string; minPoints: number } | null;
};

export type SocialSlaySession = { id: string; title: string; startsAt: string; venue: string; status: "registered" | "attended" | "waitlisted" | string };

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "S";

export async function fetchMember(userId: string): Promise<MemberSummary> {
  const [{ data: profile }, { data: stats }, { data: tiers }] = await Promise.all([
    supabase.from("profiles").select("full_name, display_name, tier").eq("id", userId).maybeSingle(),
    supabase.from("member_stats").select("points_balance, points_earned").eq("member_id", userId).maybeSingle(),
    supabase.from("membership_tiers").select("tier, label, min_points").order("min_points"),
  ]);
  const name = (profile?.display_name || profile?.full_name || "Member") as string;
  const earned = Number(stats?.points_earned ?? 0);
  const next = (tiers ?? []).find((t) => Number(t.min_points) > earned);
  return {
    name,
    initials: initialsOf(name),
    tier: ((profile?.tier as Tier | undefined) ?? "basic") as Tier,
    points: Number(stats?.points_balance ?? 0),
    earned,
    nextTier: next ? { label: String(next.label), minPoints: Number(next.min_points) } : null,
  };
}

type BookingRow = { status: string; sessions: { id: string; title: string; starts_at: string; venues: { name: string } | null } | null };

export async function fetchSocialSlaySessions(userId: string): Promise<SocialSlaySession[]> {
  const { data } = await supabase
    .from("bookings")
    .select("status, sessions(id, title, starts_at, venues(name))")
    .eq("member_id", userId)
    .neq("status", "cancelled");
  return ((data ?? []) as unknown as BookingRow[])
    .flatMap((b) => (b.sessions ? [{ id: b.sessions.id, title: b.sessions.title, startsAt: b.sessions.starts_at, venue: b.sessions.venues?.name ?? "", status: b.status }] : []))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) +
  " · " +
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
