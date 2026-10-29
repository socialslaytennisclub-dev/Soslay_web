import "server-only";
import { cache } from "react";
import QRCode from "qrcode";
import { memberSessions } from "@/content/member";
import { LEVEL_LABEL } from "@/lib/admin-labels";
import { cityOf, type City } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { TennisLevel } from "@/server/admin/types";
import { localParts } from "@/server/public/sessions";
import { getMemberSession } from "./user";

/**
 * Detail sesi untuk peserta (Figma UIF-06 · Activity Detail): info sesi, e-ticket + QR,
 * info pendaftaran, daftar peserta, line-up & leaderboard. Hanya untuk member yang punya
 * booking di sesi itu. Semua dibaca dengan klien member: sesi & line-up lewat RLS, daftar peserta
 * lewat RPC `session_roster` (nama & level saja, tanpa email / HP). Tanpa Supabase → data contoh.
 */

export type DetailPhase = "upcoming" | "live" | "done";

export type DetailPerson = { id: string; name: string; level: string; source: string; me: boolean; checkedIn: boolean };

export type DetailMatch = {
  /** null di mode demo. */
  id: string | null;
  round: number;
  court: number;
  a: string[];
  b: string[];
  /** Id roster keempat pemain (sama dengan DetailPerson.id) — untuk hitung yang sudah hadir. */
  playerIds: string[];
  scoreA: number | null;
  scoreB: number | null;
  /** Tim member yang login di match ini (null = tidak main). */
  mySide: "a" | "b" | null;
};

/** `played` = match berskor, `total` = match yang dijadwalkan untuk pemain itu. */
export type DetailStanding = { id: string; name: string; points: number; wins: number; played: number; total: number; me: boolean };

export type MemberSessionDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  typeLabel: string;
  city: City;
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  /** Check-in dibuka 30 menit sebelum mulai. */
  checkInAt: string;
  phase: DetailPhase;
  venue: { name: string; address: string; mapsUrl: string | null };
  format: { label: string; targetPoints: number; courts: number; rounds: number; lineup: boolean; leaderboardMode: "points" | "wins" };
  capacity: number;
  levels: string[];
  /** null = host yang tidak ikut main (tanpa booking) — tanpa e-ticket & info pendaftaran. */
  ticket: { code: string; qrSvg: string; holder: string; type: string; status: "registered" | "attended" } | null;
  registration: { sourceLabel: string; paid: boolean; amount: number; orderId: string | null; registeredAt: string; kuyUrl: string | null } | null;
  people: DetailPerson[];
  matches: DetailMatch[];
  standings: DetailStanding[];
  showLeaderboard: boolean;
  /** Ronde yang sedang dimainkan (null = belum ada line-up). */
  currentRound: number | null;
  /** Ronde yang sudah dimulai host lewat "Mulai Ronde" (Figma UIF-13). */
  startedRounds: number[];
  /** Ditunjuk sebagai host sesi ini (chip "Kamu host" + Panel Host). */
  isHost: boolean;
  /** Host & sesi masih berjalan → boleh input / ubah skor (dicek ulang di database). */
  canScore: boolean;
};

const FORMAT_LABEL: Record<string, string> = {
  none: "Fun game",
  americano: "Americano Doubles",
  rotating: "Rotating Partner",
  round_robin: "Round robin",
  knockout: "Knockout",
};

const SOURCE_LABEL: Record<string, string> = { kuy: "Kuy", admin: "Admin", website: "Website" };

const CHECK_IN_LEAD_MS = 30 * 60_000;

type SessionRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type_slug: string;
  starts_at: string;
  ends_at: string;
  status: string;
  capacity: number;
  kuy_booking_url: string | null;
  recommended_levels: TennisLevel[];
  match_format: string;
  court_count: number;
  round_count: number;
  target_points: number;
  leaderboard_mode: "points" | "wins";
  show_live_leaderboard: boolean;
  live_started_at: string | null;
  ended_at: string | null;
  current_round: number | null;
  started_rounds: number[] | null;
  activity_types: { label: string } | null;
  venues: { name: string; city: string; address: string | null; maps_url: string | null } | null;
};

type RosterRow = { id: string; member_id: string | null; name: string; tennis_level: TennisLevel | null; source: string; checked_in: boolean };

type MatchRow = { id: string; round_no: number; court_no: number; a1: string; a2: string; b1: string; b2: string; score_a: number | null; score_b: number | null };

/** Kode booking yang dibaca panitia: "SLY-3110-9F2A1C" (tanggal sesi + potongan id booking). */
function bookingCode(bookingId: string, date: string) {
  const [, month, day] = date.split("-");
  return `SLY-${day}${month}-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

const qrSvg = (value: string) => QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0a084a", light: "#ffffff" } });

function phaseOf(s: Pick<SessionRow, "status" | "starts_at" | "ends_at" | "live_started_at" | "ended_at">, now: number): DetailPhase {
  if (s.status === "completed" || s.ended_at || new Date(s.ends_at).getTime() < now) return "done";
  if (s.live_started_at || new Date(s.starts_at).getTime() <= now) return "live";
  return "upcoming";
}

/**
 * Ronde yang sedang dimainkan bila host/admin tidak mengisi `current_round`: ronde berskor
 * terakhir — atau ronde setelahnya yang masih kosong bila ronde itu sudah lengkap. Court yang
 * terlewat di ronde awal tidak menahan Live di ronde itu. null = belum ada line-up.
 */
function currentRoundOf(matches: MatchRow[]): number | null {
  if (!matches.length) return null;
  const scored = matches.filter((m) => m.score_a !== null);
  if (!scored.length) return Math.min(...matches.map((m) => m.round_no));
  const last = Math.max(...scored.map((m) => m.round_no));
  if (matches.some((m) => m.round_no === last && m.score_a === null)) return last;
  const upcoming = matches.filter((m) => m.round_no > last && m.score_a === null).map((m) => m.round_no);
  return upcoming.length ? Math.min(...upcoming) : last;
}

/** Leaderboard dari skor yang sudah masuk: poin = skor tim di tiap match yang dimainkan. */
function standingsOf(matches: MatchRow[], names: Map<string, string>, myIds: Set<string>, mode: "points" | "wins"): DetailStanding[] {
  const table = new Map<string, DetailStanding>();
  const row = (id: string) => {
    let r = table.get(id);
    if (!r) table.set(id, (r = { id, name: names.get(id) ?? "Pemain", points: 0, wins: 0, played: 0, total: 0, me: myIds.has(id) }));
    return r;
  };
  for (const m of matches) {
    for (const id of [m.a1, m.a2, m.b1, m.b2]) row(id).total += 1;
    if (m.score_a === null || m.score_b === null) continue;
    for (const [team, own, other] of [
      [[m.a1, m.a2], m.score_a, m.score_b],
      [[m.b1, m.b2], m.score_b, m.score_a],
    ] as const) {
      for (const id of team) {
        const r = row(id);
        r.points += own;
        r.played += 1;
        if (own > other) r.wins += 1;
      }
    }
  }
  return [...table.values()].sort((x, y) => (mode === "wins" ? y.wins - x.wins || y.points - x.points : y.points - x.points || y.wins - x.wins) || x.name.localeCompare(y.name));
}

export const getMySessionDetail = cache(async (slug: string): Promise<MemberSessionDetail | null> => {
  if (!isSupabaseConfigured) return demoDetail(slug);

  const { supabase, user } = await getMemberSession();
  if (!user) return null;

  // RLS: member boleh membaca sesi yang ia ikuti / yang ia host (termasuk visibilitas Link).
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, slug, title, description, type_slug, starts_at, ends_at, status, capacity, kuy_booking_url, recommended_levels, match_format, court_count, round_count, target_points, leaderboard_mode, show_live_leaderboard, live_started_at, ended_at, current_round, started_rounds, activity_types(label), venues(name, city, address, maps_url)",
    )
    .eq("slug", slug)
    .maybeSingle<SessionRow>();
  if (!session?.venues || session.status === "draft" || session.status === "cancelled") return null;

  // Akses: punya booking aktif (peserta) atau ditunjuk sebagai host sesi ini.
  const [{ data: booking }, { data: assigned }] = await Promise.all([
    supabase.from("bookings").select("id, status, payment_status, source, amount, created_at").eq("session_id", session.id).eq("member_id", user.id).neq("status", "cancelled").maybeSingle(),
    supabase.rpc("is_assigned_host", { p_session: session.id }),
  ]);
  if (!booking && assigned !== true) return null;

  const [{ data: myRows }, { data: roster }, { data: matches }, { data: canScore }, qr] = await Promise.all([
    // Baris peserta milik sendiri (RLS) — untuk no. registrasi Kuyy & jumlah bayar. Bisa lebih dari
    // satu (impor Kuyy + tambahan manual admin), jadi ambil semua: yang pertama untuk data daftar.
    supabase.from("session_participants").select("id, full_name, kuy_reg_no, checked_in_at, amount").eq("session_id", session.id).eq("member_id", user.id).order("imported_at"),
    supabase.rpc("session_roster", { p_session: session.id }),
    supabase.from("session_matches").select("id, round_no, court_no, a1, a2, b1, b2, score_a, score_b").eq("session_id", session.id).order("round_no").order("court_no").returns<MatchRow[]>(),
    supabase.rpc("is_session_host", { p_session: session.id }),
    // Isi QR = id booking, supaya pemindai panitia nanti bisa langsung menandai check-in.
    booking ? qrSvg(`soslay:booking:${booking.id}`) : null,
  ]);

  // Member tampil dengan nama Soslay (RPC sudah memilih nama profil bila terhubung).
  const people: DetailPerson[] = ((roster ?? []) as RosterRow[])
    .map((p) => ({
      id: p.id,
      name: p.name,
      level: p.tennis_level ? LEVEL_LABEL[p.tennis_level] : "Level belum diisi",
      source: SOURCE_LABEL[p.source] ?? "Website",
      me: p.member_id === user.id,
      checkedIn: p.checked_in,
    }))
    .sort((x, y) => Number(y.me) - Number(x.me));

  const names = new Map(people.map((p) => [p.id, p.name]));
  const mine = myRows?.[0] ?? null;
  const myIds = new Set((myRows ?? []).map((r) => r.id as string));
  const matchRows = matches ?? [];
  const side = (m: MatchRow): DetailMatch["mySide"] => (myIds.has(m.a1) || myIds.has(m.a2) ? "a" : myIds.has(m.b1) || myIds.has(m.b2) ? "b" : null);
  const city = cityOf(session.venues.city);
  const start = localParts(session.starts_at, city);

  return {
    id: session.id,
    slug: session.slug,
    title: session.title,
    description: session.description ?? "",
    typeLabel: session.activity_types?.label ?? "Sesi",
    city,
    date: start.date,
    start: start.time,
    end: localParts(session.ends_at, city).time,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    checkInAt: new Date(new Date(session.starts_at).getTime() - CHECK_IN_LEAD_MS).toISOString(),
    phase: phaseOf(session, Date.now()),
    venue: { name: session.venues.name, address: session.venues.address ?? session.venues.city, mapsUrl: session.venues.maps_url },
    format: {
      label: FORMAT_LABEL[session.match_format] ?? "Fun game",
      targetPoints: session.target_points,
      courts: session.court_count,
      rounds: session.round_count,
      lineup: session.match_format === "americano" || session.match_format === "rotating",
      leaderboardMode: session.leaderboard_mode,
    },
    capacity: session.capacity,
    levels: (session.recommended_levels ?? []).map((l) => LEVEL_LABEL[l]),
    ticket:
      booking && qr
        ? {
            code: bookingCode(booking.id as string, start.date),
            qrSvg: qr,
            holder: people.find((p) => p.me)?.name ?? mine?.full_name ?? "Member",
            type: "Player",
            status: booking.status === "attended" || mine?.checked_in_at ? "attended" : "registered",
          }
        : null,
    registration: booking
      ? {
          sourceLabel: booking.source === "kuy" ? "Dibayar via Kuyy" : booking.source === "admin" ? "Didaftarkan admin" : "Daftar via website",
          paid: booking.payment_status === "paid",
          amount: mine?.amount || (booking.amount as number) || 0,
          orderId: mine?.kuy_reg_no && !mine.kuy_reg_no.startsWith("ROW") && !mine.kuy_reg_no.startsWith("ADM") ? mine.kuy_reg_no : null,
          registeredAt: booking.created_at as string,
          kuyUrl: session.kuy_booking_url,
        }
      : null,
    people,
    matches: matchRows.map((m) => ({
      id: m.id,
      round: m.round_no,
      court: m.court_no,
      a: [m.a1, m.a2].map((id) => names.get(id) ?? "Pemain"),
      b: [m.b1, m.b2].map((id) => names.get(id) ?? "Pemain"),
      playerIds: [m.a1, m.a2, m.b1, m.b2],
      scoreA: m.score_a,
      scoreB: m.score_b,
      mySide: side(m),
    })),
    standings: standingsOf(matchRows, names, myIds, session.leaderboard_mode),
    showLeaderboard: session.show_live_leaderboard,
    currentRound: session.current_round ?? currentRoundOf(matchRows),
    startedRounds: session.started_rounds ?? [],
    isHost: assigned === true,
    canScore: canScore === true,
  };
});

/** Mode demo (tanpa Supabase): detail dari sesi contoh di content/member. */
async function demoDetail(slug: string): Promise<MemberSessionDetail | null> {
  const s = memberSessions.find((x) => x.slug === slug);
  if (!s) return null;
  const offset = s.city === "Bali" ? "+08:00" : "+07:00";
  const startsAt = new Date(`${s.date}T${s.start}:00${offset}`).toISOString();
  const endsAt = new Date(`${s.date}T${s.end}:00${offset}`).toISOString();
  const names = ["Arya Putra Dewangga", "Kevin Wijaya", "Anitya Ayu Silfia", "Nadia Salsabila", "Yudi Sadewa", "Agatha Putri", "Ardi Nugroho", "Fadil Rahman"];
  return {
    id: s.slug,
    slug: s.slug,
    title: s.title,
    description: "Di format Americano, kamu berganti partner setiap ronde. Poin individu dihitung dari skor tim di setiap match yang kamu mainkan.",
    typeLabel: s.title,
    city: s.city,
    date: s.date,
    start: s.start,
    end: s.end,
    startsAt,
    endsAt,
    checkInAt: new Date(new Date(startsAt).getTime() - CHECK_IN_LEAD_MS).toISOString(),
    phase: s.status === "done" ? "done" : "upcoming",
    venue: { name: s.venue, address: s.city, mapsUrl: null },
    format: { label: "Americano Doubles", targetPoints: 21, courts: 2, rounds: 7, lineup: true, leaderboardMode: "points" },
    capacity: 8,
    levels: ["Beginner", "Intermediate"],
    ticket: { code: bookingCode("9f2a1c00", s.date), qrSvg: await qrSvg(`soslay:booking:demo-${s.slug}`), holder: names[0], type: "Player", status: s.status === "done" ? "attended" : "registered" },
    registration: { sourceLabel: "Dibayar via Kuyy", paid: true, amount: 150_000, orderId: "U1", registeredAt: new Date(new Date(startsAt).getTime() - 14 * 86_400_000).toISOString(), kuyUrl: "https://kuy.id/soslay" },
    people: names.map((name, i) => ({ id: String(i), name, level: ["Intermediate", "Advanced", "Beginner"][i % 3], source: i % 2 ? "Kuy" : "Website", me: i === 0, checkedIn: s.status === "done" })),
    matches: [],
    standings: [],
    showLeaderboard: true,
    currentRound: null,
    startedRounds: [],
    isHost: false,
    canScore: false,
  };
}
