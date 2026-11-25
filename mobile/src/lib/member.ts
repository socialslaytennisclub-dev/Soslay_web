import { supabase } from "./supabase";

/** App hanya membaca schema "app" (view ke data bersama), bukan tabel public milik web. */
const app = () => supabase.schema("app");

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

export async function fetchMember(_userId: string): Promise<MemberSummary> {
  const [{ data: profile }, { data: stats }, { data: tiers }] = await Promise.all([
    app().from("my_profile").select("full_name, display_name, tier").maybeSingle(),
    app().from("my_points").select("points_balance, points_earned").maybeSingle(),
    app().from("tiers").select("tier, label, min_points").order("min_points"),
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

type SessionRow = { session_id: string; title: string; starts_at: string; venue: string | null; status: string };

// userId tetap diterima agar pemanggil tidak berubah; view my_sessions sudah memfilter ke auth.uid().
export async function fetchSocialSlaySessions(_userId: string): Promise<SocialSlaySession[]> {
  const { data } = await app().from("my_sessions").select("session_id, title, starts_at, venue, status").order("starts_at", { ascending: false });
  return ((data ?? []) as SessionRow[]).map((r) => ({ id: r.session_id, title: r.title, startsAt: r.starts_at, venue: r.venue ?? "", status: r.status }));
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) +
  " · " +
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
