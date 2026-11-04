import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type LateCheckIn = { checked_in_at: string; checked_in_by: string };
/** Kolom check-in untuk peserta yang ditambahkan setelah sesi selesai. */
export const lateCheckIn = (by: string): LateCheckIn => ({ checked_in_at: new Date().toISOString(), checked_in_by: by });

export const REVIVE_FAILED = "booking member yang dulu dibatalkan gagal dihidupkan — poinnya belum masuk, batalkan lalu ulangi check-in";

/**
 * Booking member yang dulu dibatalkan tidak ikut disinkron trigger check-in (status cancelled
 * dilewati) → peserta tampil Hadir tanpa poin. Hidupkan lagi sebagai hadir; poin lewat trigger
 * bookings. Dipakai peserta susulan (play.ts) dan check-in admin (setCheckIn), jadi saran
 * "batalkan lalu ulangi check-in" di REVIVE_FAILED memang memperbaikinya.
 */
export async function reviveCancelledBookings(supabase: Supabase, sessionId: string, memberIds: string[], checkIn: LateCheckIn): Promise<boolean> {
  if (!memberIds.length) return true;
  const { error } = await supabase
    .from("bookings")
    .update({ status: "attended", ...checkIn })
    .eq("session_id", sessionId)
    .eq("status", "cancelled")
    .in("member_id", memberIds);
  if (error) console.warn(`[participants] gagal menghidupkan booking batal sesi ${sessionId}: ${error.message}`);
  return !error;
}
