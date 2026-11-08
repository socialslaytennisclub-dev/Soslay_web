import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { membersByIds } from "./identity";
import type { SessionReview } from "./types";

type ReviewRow = {
  member_id: string;
  rating: number;
  host_rating: number | null;
  venue_rating: number | null;
  format_rating: number | null;
  highlights: string[] | null;
  comment: string | null;
  testimonial: boolean;
  updated_at: string;
};

/**
 * Review sesi untuk halaman edit activity (RLS "admin read reviews"). `load` = false (mode demo, atau sesi
 * belum selesai sehingga belum mungkin ada review) → tidak query.
 */
/** `isHost` diisi pemanggil (daftar host sesi dimuat paralel). */
export async function loadSessionReviews(sessionId: string, load: boolean): Promise<SessionReview[]> {
  if (!load) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("session_reviews")
    .select("member_id, rating, host_rating, venue_rating, format_rating, highlights, comment, testimonial, updated_at")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false })
    .returns<ReviewRow[]>();
  const rows = data ?? [];
  const people = await membersByIds([...new Set(rows.map((r) => r.member_id))]);
  return rows.map((r) => ({
    memberId: r.member_id,
    name: people.get(r.member_id)?.fullName ?? "Member",
    isHost: false,
    rating: r.rating,
    host: r.host_rating,
    venue: r.venue_rating,
    format: r.format_rating,
    highlights: r.highlights ?? [],
    comment: r.comment,
    testimonial: r.testimonial,
    at: r.updated_at,
  }));
}
