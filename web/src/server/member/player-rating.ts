import "server-only";
import { cache } from "react";
import type { RatingQueueItem } from "@/lib/player-level";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "./user";

/**
 * Penilaian level pemain oleh host (beta): antrean lewat RPC `host_rating_queue` — host hanya menerima
 * nilainya sendiri, tidak pernah nilai host lain. Bukan host → antrean kosong. Tanpa Supabase → contoh.
 */

type QueueRow = {
  member_id: string;
  name: string;
  avatar: string | null;
  times: number;
  last_title: string | null;
  last_at: string | null;
  venue: string | null;
  cohosts: string[];
  ntrp: number | string | null;
  rated: boolean;
  rated_at: string | null;
  due: boolean;
};

const DEMO_NAMES = ["Rina Maharani", "Budi Santoso", "Citra Lestari", "Dimas Prakoso", "Eka Wulandari", "Farhan Akbar", "Gita Puspita", "Hendra Wijaya"];

function demoQueue(sessionId?: string): RatingQueueItem[] {
  const day = 24 * 3600 * 1000;
  const items = DEMO_NAMES.map((name, i) => ({
    memberId: `demo-rate-${i}`,
    name,
    avatar: null,
    times: Math.max(1, 5 - Math.floor(i / 2)),
    lastTitle: i % 2 ? "Weekly Mabar" : "Match Day Americano",
    lastAt: new Date(Date.now() - (i + 1) * 3 * day).toISOString(),
    venue: i % 3 ? "The Citadel" : "Common Grounds",
    cohosts: i % 4 === 1 ? ["Dimas"] : [],
    ntrp: i === 6 ? 3.5 : null,
    rated: i >= 6,
    ratedAt: i >= 6 ? new Date(Date.now() - 10 * day).toISOString() : null,
    due: i < 6,
  }));
  return sessionId ? items.slice(0, 3) : items;
}

const toItem = (r: QueueRow): RatingQueueItem => ({
  memberId: r.member_id,
  name: r.name,
  avatar: r.avatar,
  times: r.times,
  lastTitle: r.last_title,
  lastAt: r.last_at,
  venue: r.venue,
  cohosts: r.cohosts ?? [],
  ntrp: r.ntrp === null ? null : Number(r.ntrp),
  rated: r.rated,
  ratedAt: r.rated_at,
  due: r.due,
});

/** Antrean host yang login; `sessionId` → hanya peserta hadir activity itu. null = belum masuk. */
export const getMyRatingQueue = cache(async (sessionId?: string): Promise<RatingQueueItem[] | null> => {
  if (!isSupabaseConfigured) return demoQueue(sessionId);
  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  const { data, error } = await supabase.rpc("host_rating_queue", sessionId ? { p_session: sessionId } : {});
  // PGRST202 = migrasi belum dipasang → fitur disembunyikan diam-diam.
  if (error && error.code !== "PGRST202") console.error(`[rating] host_rating_queue: ${error.code ?? ""} ${error.message}`);
  if (error || !data) return [];
  return (data as QueueRow[]).map(toItem);
});
