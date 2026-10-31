import "server-only";
import { cache } from "react";
import type { MemberDashboard, MemberTier } from "@/content/member";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "./user";

/**
 * Dashboard member yang login (Slay Activity, Slay Point, Info Grafis) dari data asli: booking yang
 * hadir, ledger Slay Point, tier, dan target tahunan di Settings admin. Waktu dihitung di WIB.
 * Tanpa Supabase / belum login → null, halaman memakai data contoh.
 */

const TZ = "Asia/Jakarta";
const DAY_MS = 86_400_000;
const WEEKS = 52;
const DEFAULT_TARGETS = { sessions: 96, hours: 150, venues: 10 };

type Played = { starts: Date; hours: number; venue: string };
type BookingRow = { status: string; sessions: { starts_at: string; ends_at: string; venues: { name: string } | null } | null };

const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** Tanggal (YYYY-MM-DD), bulan (YYYY-MM), tahun & jam lokal WIB. */
function local(date: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, year: p.year, hour: Number(p.hour) };
}

/** Senin minggu itu (YYYY-MM-DD) + indeks hari (Sen = 0). */
function weekOf(isoDate: string) {
  const t = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)));
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return { monday: new Date(t - day * DAY_MS).toISOString().slice(0, 10), day };
}

const mostCommon = <T,>(items: T[]) => {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

const timeOfDay = (hour: number) => `${String(hour).padStart(2, "0")}.00 ${hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam"}`;

export const getMyDashboard = cache(async (): Promise<MemberDashboard | null> => {
  if (!isSupabaseConfigured) return null;
  const { supabase, user } = await getMemberSession();
  if (!user) return null;

  const now = new Date();
  const [{ data: stats }, { data: week }, { data: tiers }, { data: bookings }, { data: setting }] = await Promise.all([
    supabase.from("member_stats").select("points_balance, points_earned").eq("member_id", user.id).maybeSingle(),
    supabase.from("points_ledger").select("delta").eq("member_id", user.id).gt("delta", 0).gte("created_at", new Date(now.getTime() - 7 * DAY_MS).toISOString()),
    supabase.from("membership_tiers").select("label, min_points").order("min_points"),
    supabase.from("bookings").select("status, sessions(starts_at, ends_at, venues(name))").eq("member_id", user.id).in("status", ["attended", "registered"]),
    supabase.from("app_settings").select("value").eq("key", "annual_targets").maybeSingle(),
  ]);

  const rows = (bookings ?? []) as unknown as BookingRow[];
  const played: Played[] = rows.flatMap((b) =>
    b.status === "attended" && b.sessions
      ? [{ starts: new Date(b.sessions.starts_at), hours: (Date.parse(b.sessions.ends_at) - Date.parse(b.sessions.starts_at)) / 3_600_000, venue: b.sessions.venues?.name ?? "" }]
      : [],
  );
  const today = local(now);
  const sum = (list: Played[]) => Math.round(list.reduce((total, p) => total + p.hours, 0));
  const venues = (list: Played[]) => new Set(list.map((p) => p.venue).filter(Boolean)).size;

  // Slay Activity — bulan berjalan + streak minggu berturut-turut (minggu ini boleh belum main).
  const thisMonth = played.filter((p) => local(p.starts).month === today.month);
  const playedWeeks = new Set(played.map((p) => weekOf(local(p.starts).date).monday));
  const currentMonday = weekOf(today.date).monday;
  let cursor = Date.parse(currentMonday) - (playedWeeks.has(currentMonday) ? 0 : 7 * DAY_MS);
  let streak = 0;
  while (playedWeeks.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak++;
    cursor -= 7 * DAY_MS;
  }

  const targets = { ...DEFAULT_TARGETS, ...((setting?.value as Partial<typeof DEFAULT_TARGETS> | null) ?? {}) };
  const thisYear = played.filter((p) => local(p.starts).year === today.year);

  // Heatmap 52 minggu (Sen → Min), minggu terakhir = minggu ini.
  const firstMonday = Date.parse(currentMonday) - (WEEKS - 1) * 7 * DAY_MS;
  const weeks = Array.from({ length: WEEKS }, () => new Array<number>(7).fill(0));
  for (const p of played) {
    const { monday, day } = weekOf(local(p.starts).date);
    const index = Math.round((Date.parse(monday) - firstMonday) / (7 * DAY_MS));
    if (index >= 0 && index < WEEKS) weeks[index][day]++;
  }
  const upcoming = rows
    .filter((b) => b.status === "registered" && b.sessions && Date.parse(b.sessions.starts_at) > now.getTime())
    .map((b) => b.sessions!.starts_at)
    .sort()[0];

  const earned = Number(stats?.points_earned ?? 0);
  const next = (tiers ?? []).find((t) => Number(t.min_points) > earned);
  const favoriteHour = mostCommon(played.map((p) => local(p.starts).hour));

  return {
    activity: {
      period: "Bulan ini",
      sessions: thisMonth.length,
      unit: "sesi",
      monthlyTarget: Math.max(1, Math.round(targets.sessions / 12)),
      stats: [
        { value: `${sum(thisMonth)}j`, label: "Jam main" },
        { value: String(venues(thisMonth)), label: "Venue" },
        { value: `${streak} mgg`, label: "Streak" },
      ],
    },
    points: {
      balance: Number(stats?.points_balance ?? 0),
      earned,
      earnedThisWeek: (week ?? []).reduce((total, row) => total + Number(row.delta), 0),
      nextTier: next ? { name: next.label as MemberTier, threshold: Number(next.min_points) } : null,
      redeemCopy: "Tukar poin dengan merch & sesi gratis",
    },
    targets: {
      title: "Target tahunan",
      subtitle: `Progres menuju target ${today.year}`,
      rings: [
        { key: "sesi", label: "Sesi", value: thisYear.length, target: targets.sessions, color: "navy" },
        { key: "jam", label: "Jam bermain", value: sum(thisYear), target: targets.hours, color: "indigo" },
        { key: "venue", label: "Venue", value: venues(thisYear), target: targets.venues, color: "pink" },
      ],
    },
    heatmap: { title: "Hari paling aktif", weeks, lastWeekStart: currentMonday, nextSession: upcoming ? local(new Date(upcoming)).date : null },
    favorites: {
      time: favoriteHour === undefined ? "—" : timeOfDay(favoriteHour),
      venue: mostCommon(played.map((p) => p.venue).filter(Boolean)) ?? "—",
    },
  };
});
