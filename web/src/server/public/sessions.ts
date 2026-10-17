import "server-only";
import { cache } from "react";
import { isActivityType, sessions as contentSessions, type Session, type TennisLevel } from "@/content/activity";
import { CITY_TIMEZONE, type City } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Sesi untuk website (Activity, Venue detail). Dengan Supabase: sesi yang dibuat/diubah di
 * admin (RLS hanya mengembalikan sesi publik yang sudah tayang). Tanpa Supabase: konten statis.
 */

const KUY_DEFAULT = "https://kuy.id/soslay";
/** Sesi lama tidak perlu dimuat: website hanya menampilkan beberapa sesi terakhir. */
const PAST_WINDOW_DAYS = 120;

type Row = {
  id: string;
  slug: string;
  title: string;
  type_slug: string;
  starts_at: string;
  ends_at: string;
  cover_path: string | null;
  kuy_booking_url: string | null;
  is_featured: boolean;
  show_on_homepage: boolean;
  visible_until: string | null;
  price: number;
  capacity: number;
  recommended_levels: TennisLevel[];
  venues: { name: string; city: string; address: string | null; cover_path: string | null } | null;
};

/** Tanggal & jam lokal venue ("2026-10-18", "07:00"). */
function localParts(iso: string, city: City) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CITY_TIMEZONE[city],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export const getWebsiteSessions = cache(async (): Promise<Session[]> => {
  if (!isSupabaseConfigured) return contentSessions;

  const since = new Date(Date.now() - PAST_WINDOW_DAYS * 86_400_000).toISOString();
  const client = createSupabasePublicClient();
  const [{ data, error }, { data: slots }] = await Promise.all([
    client
      .from("sessions")
      .select("id, slug, title, type_slug, starts_at, ends_at, cover_path, kuy_booking_url, is_featured, show_on_homepage, visible_until, price, capacity, recommended_levels, venues(name, city, address, cover_path)")
      .in("status", ["published", "completed"])
      .gte("starts_at", since)
      .order("starts_at")
      .limit(500),
    // Sisa slot sesi mendatang (bookings tidak bisa dibaca publik → fungsi SECURITY DEFINER).
    client.rpc("public_session_slots"),
  ]);
  const slotsLeft = new Map(((slots ?? []) as { session_id: string; slots_left: number }[]).map((r) => [r.session_id, r.slots_left]));
  // Database tidak bisa dihubungi → tetap tampilkan jadwal statis, jangan halaman error.
  if (error || !data) {
    console.error("[sessions] gagal memuat dari Supabase:", error?.message);
    return contentSessions;
  }

  const now = Date.now();
  return (data as unknown as Row[]).flatMap((s): Session[] => {
    if (!s.venues || !isActivityType(s.type_slug)) return [];
    if (s.visible_until && new Date(s.visible_until).getTime() < now && new Date(s.starts_at).getTime() > now) return [];
    const city: City = s.venues.city === "Bali" ? "Bali" : "Jakarta";
    const start = localParts(s.starts_at, city);
    const end = localParts(s.ends_at, city);
    return [
      {
        slug: s.slug,
        title: s.title,
        type: s.type_slug,
        venue: { name: s.venues.name, city, address: s.venues.address ?? undefined },
        date: start.date,
        start: start.time,
        end: end.time,
        image: s.cover_path || s.venues.cover_path || "/images/home/activity-weekly-mabar.webp",
        bookingUrl: s.kuy_booking_url || KUY_DEFAULT,
        featured: s.is_featured || s.show_on_homepage,
        price: s.price,
        capacity: s.capacity,
        slotsLeft: slotsLeft.get(s.id),
        levels: s.recommended_levels ?? [],
      },
    ];
  });
});
