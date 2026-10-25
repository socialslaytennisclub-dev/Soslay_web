import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DataSession } from "./dataset";
import { membersByIds } from "./identity";
import type { MatchFormat, SessionHost, SessionMatch, SessionParticipant, SessionPhotos, SessionPlay, TennisLevel } from "./types";

/**
 * Data permainan sesi: format & skor, peserta import Kuyy, host per sesi, line-up.
 * Mode demo tidak punya tabel ini → format default dan peserta dari booking demo.
 */

export const DEFAULT_PLAY: SessionPlay = {
  matchFormat: "none",
  courtCount: 2,
  roundCount: 9,
  targetPoints: 21,
  scoreEntry: "host",
  leaderboardMode: "points",
  showLeaderboard: true,
  liveStartedAt: null,
  endedAt: null,
};

/** Urutkan nomor registrasi Kuyy secara alami: U2 sebelum U10. */
export const byRegNo = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "en", { numeric: true });

type PlayRow = {
  match_format: MatchFormat;
  court_count: number;
  round_count: number;
  target_points: number;
  score_entry: "host" | "participants";
  leaderboard_mode: "points" | "wins";
  show_live_leaderboard: boolean;
  live_started_at: string | null;
  ended_at: string | null;
  photo_album_url: string | null;
  photo_cover_path: string | null;
  photo_count: number | null;
  photos_posted_at: string | null;
};
type RosterRow = {
  id: string;
  member_id: string | null;
  full_name: string;
  kuy_username: string | null;
  ghost_id: string | null;
  phone: string | null;
  source: "kuy" | "admin";
  tennis_level: TennisLevel | null;
  kuy_reg_no: string | null;
  checked_in_at: string | null;
};
type HostRow = { member_id: string; role: "host" | "photographer" };
type MatchRow = { id: string; round_no: number; court_no: number; a1: string; a2: string; b1: string; b2: string; score_a: number | null; score_b: number | null };

export type SessionPlayData = {
  play: SessionPlay;
  /** null = belum ada import (pakai daftar booking). */
  roster: SessionParticipant[] | null;
  hosts: SessionHost[];
  matches: SessionMatch[];
  photos: SessionPhotos;
};

export const NO_PHOTOS: SessionPhotos = { albumUrl: "", coverPath: null, count: null, postedAt: null };

export async function loadSessionPlay(session: DataSession, live: boolean): Promise<SessionPlayData> {
  if (!live) {
    return { play: { ...DEFAULT_PLAY, matchFormat: session.typeSlug === "match-day" ? "americano" : "none" }, roster: null, hosts: [], matches: [], photos: NO_PHOTOS };
  }
  const supabase = await createSupabaseServerClient();
  const id = session.id;
  const [play, roster, hosts, matches] = await Promise.all([
    supabase
      .from("sessions")
      .select("match_format, court_count, round_count, target_points, score_entry, leaderboard_mode, show_live_leaderboard, live_started_at, ended_at, photo_album_url, photo_cover_path, photo_count, photos_posted_at")
      .eq("id", id)
      .single<PlayRow>(),
    supabase
      .from("session_participants")
      .select("id, member_id, full_name, kuy_username, ghost_id, phone, tennis_level, kuy_reg_no, checked_in_at, source")
      .eq("session_id", id)
      .returns<RosterRow[]>(),
    supabase.from("session_hosts").select("member_id, role").eq("session_id", id).returns<HostRow[]>(),
    supabase
      .from("session_matches")
      .select("id, round_no, court_no, a1, a2, b1, b2, score_a, score_b")
      .eq("session_id", id)
      .order("round_no")
      .order("court_no")
      .returns<MatchRow[]>(),
  ]);

  // Member → nama & ID dari database Soslay (bisa beda dengan nama/username di file Kuyy),
  // sekaligus jumlah aktivitas tiap ghost member di semua sesi.
  const memberIds = [...new Set([...(roster.data ?? []).map((r) => r.member_id), ...(hosts.data ?? []).map((h) => h.member_id)].filter((id): id is string => Boolean(id)))];
  const ghostIds = [...new Set((roster.data ?? []).filter((r) => !r.member_id && r.ghost_id).map((r) => r.ghost_id as string))];
  const [profiles, ghostRows] = await Promise.all([
    membersByIds(memberIds),
    ghostIds.length ? supabase.from("session_participants").select("ghost_id").in("ghost_id", ghostIds) : Promise.resolve({ data: [] }),
  ]);
  const ghostCounts = new Map<string, number>();
  for (const r of ghostRows.data ?? []) ghostCounts.set(r.ghost_id as string, (ghostCounts.get(r.ghost_id as string) ?? 0) + 1);

  const p = play.data;
  return {
    play: p
      ? {
          matchFormat: p.match_format,
          courtCount: p.court_count,
          roundCount: p.round_count,
          targetPoints: p.target_points,
          scoreEntry: p.score_entry,
          leaderboardMode: p.leaderboard_mode,
          showLeaderboard: p.show_live_leaderboard,
          liveStartedAt: p.live_started_at,
          endedAt: p.ended_at,
        }
      : DEFAULT_PLAY,
    roster: roster.data?.length
      ? [...roster.data]
          .sort((a, b) => byRegNo(a.kuy_reg_no, b.kuy_reg_no))
          .map((r) => ({
            id: r.id,
            memberId: r.member_id,
            name: (r.member_id && profiles.get(r.member_id)?.fullName) || r.full_name,
            kuyId: r.member_id ? (profiles.get(r.member_id)?.kuyId ?? "") : (r.kuy_username ?? ""),
            memberCode: r.member_id ? (profiles.get(r.member_id)?.memberCode ?? "") : "",
            ghostActivities: !r.member_id && r.ghost_id ? (ghostCounts.get(r.ghost_id) ?? 1) : null,
            phone: r.phone ?? "",
            level: r.tennis_level,
            payment: "paid",
            status: r.checked_in_at ? "attended" : "registered",
            source: r.source,
            checkedIn: Boolean(r.checked_in_at),
            guests: 0,
          }))
      : null,
    hosts: (hosts.data ?? []).map((h) => ({ memberId: h.member_id, name: profiles.get(h.member_id)?.fullName ?? "Member", code: profiles.get(h.member_id)?.memberCode ?? "", role: h.role ?? "host" })),
    photos: p
      ? { albumUrl: p.photo_album_url ?? "", coverPath: p.photo_cover_path, count: p.photo_count, postedAt: p.photos_posted_at }
      : NO_PHOTOS,
    matches: (matches.data ?? []).map((m) => ({ id: m.id, round: m.round_no, court: m.court_no, a: [m.a1, m.a2], b: [m.b1, m.b2], scoreA: m.score_a, scoreB: m.score_b })),
  };
}
