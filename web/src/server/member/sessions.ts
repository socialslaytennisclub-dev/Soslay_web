import "server-only";
import { cache } from "react";
import type { MemberSession } from "@/content/member";
import { cityOf } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { localParts } from "@/server/public/sessions";
import { getMemberSession } from "./user";

/**
 * Sesi milik member yang login (Dashboard "Activity" + tab My Activities), dari tabel bookings —
 * termasuk peserta hasil impor Kuyy / tambahan manual admin (trigger session_participant_sync).
 * Tanpa Supabase / belum login → null, halaman memakai data contoh.
 */

type SessionRow = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cover_path: string | null;
  venues: { name: string; city: string; cover_path: string | null } | null;
};

export const getMySessions = cache(async (): Promise<MemberSession[] | null> => {
  if (!isSupabaseConfigured) return null;
  const { supabase, user } = await getMemberSession();
  if (!user) return null;

  const [{ data: bookings }, { data: points }] = await Promise.all([
    supabase.from("bookings").select("id, session_id, status").eq("member_id", user.id).neq("status", "cancelled"),
    supabase.from("points_ledger").select("booking_id, delta").eq("member_id", user.id).eq("reason", "attendance"),
  ]);
  if (!bookings?.length) return [];

  // RLS "member read booked sessions": sesi yang ia ikuti terbaca, termasuk visibilitas Link.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, slug, title, starts_at, ends_at, status, cover_path, venues(name, city, cover_path)")
    .in(
      "id",
      bookings.map((b) => b.session_id as string),
    );

  const byId = new Map(((sessions ?? []) as unknown as SessionRow[]).map((s) => [s.id, s]));
  const earned = new Map((points ?? []).map((p) => [p.booking_id as string, p.delta as number]));
  const now = Date.now();

  return bookings.flatMap((b): MemberSession[] => {
    const s = byId.get(b.session_id as string);
    if (!s || !s.venues || s.status === "cancelled" || s.status === "draft") return [];
    const city = cityOf(s.venues.city);
    const start = localParts(s.starts_at, city);
    const done = s.status === "completed" || new Date(s.ends_at).getTime() < now;
    return [
      {
        slug: s.slug,
        title: s.title,
        venue: s.venues.name,
        city,
        date: start.date,
        start: start.time,
        end: localParts(s.ends_at, city).time,
        image: s.cover_path || s.venues.cover_path || "/images/home/activity-weekly-mabar.webp",
        status: done ? "done" : "registered",
        points: earned.get(b.id as string),
      },
    ];
  });
});
