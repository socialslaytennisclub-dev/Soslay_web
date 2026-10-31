import "server-only";
import { cityOf, type City } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "./user";

const CHECK_IN_LEAD_MS = 30 * 60_000;

/**
 * Check-in dibuka 30 menit sebelum jadwal — atau sejak admin me-live-kan sesi lebih awal — s.d.
 * jadwal selesai. Sama dengan RPC member_self_check_in; dipakai detail sesi & /akun/absensi.
 */
export const checkInOpensAt = (startsAt: string, liveStartedAt: string | null) =>
  new Date(Math.min(new Date(startsAt).getTime() - CHECK_IN_LEAD_MS, liveStartedAt ? new Date(liveStartedAt).getTime() : Infinity)).toISOString();
/** Sesi yang tampil di halaman absensi: yang belum selesai dan mulai dalam 18 jam ke depan (termasuk besok pagi). */
const LOOKAHEAD_MS = 18 * 3_600_000;

export type CheckInItem = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: City;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  checkedIn: boolean;
  /** null = belum check-in / waktunya tidak tercatat. */
  checkedInAt: string | null;
};

type SessionRow = { id: string; slug: string; title: string; starts_at: string; ends_at: string; status: string; ended_at: string | null; live_started_at: string | null; venues: { name: string; city: string } | null };

/**
 * Sesi member yang login untuk check-in mandiri (/akun/absensi): booking aktif (termasuk peserta
 * impor Kuyy yang tersambung ke akunnya) yang belum selesai & mulai dalam 18 jam. Belum login → kosong.
 */
export async function getMyCheckIns(): Promise<{ items: CheckInItem[]; now: number }> {
  const now = Date.now();
  if (!isSupabaseConfigured) return { items: [], now };
  const { supabase, user } = await getMemberSession();
  if (!user) return { items: [], now };

  const { data: booked } = await supabase.from("bookings").select("session_id, status, checked_in_at").eq("member_id", user.id).neq("status", "cancelled");
  if (!booked?.length) return { items: [], now };

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, slug, title, starts_at, ends_at, status, ended_at, live_started_at, venues(name, city)")
    .in(
      "id",
      booked.map((b) => b.session_id as string),
    )
    .gt("ends_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + LOOKAHEAD_MS).toISOString())
    .order("starts_at");

  const bookingOf = new Map(booked.map((b) => [b.session_id as string, b]));
  const items = ((sessions ?? []) as unknown as SessionRow[]).flatMap((s): CheckInItem[] => {
    if (!s.venues || s.ended_at || s.status === "completed" || s.status === "cancelled" || s.status === "draft") return [];
    const b = bookingOf.get(s.id);
    return [
      {
        id: s.id,
        slug: s.slug,
        title: s.title,
        venue: s.venues.name,
        city: cityOf(s.venues.city),
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        opensAt: checkInOpensAt(s.starts_at, s.live_started_at),
        checkedIn: b?.status === "attended",
        checkedInAt: b?.status === "attended" ? ((b.checked_in_at as string | null) ?? null) : null,
      },
    ];
  });
  return { items, now };
}
