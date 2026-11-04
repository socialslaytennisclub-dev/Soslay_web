"use server";

import { redirect } from "next/navigation";
import { isActivityType } from "@/content/activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { discardUploads, isOwnUpload, uploadPublicImage } from "../../storage";
import { monthKey } from "../time";
import type { MatchFormat, TennisLevel } from "../types";
import { audit, refreshPaths, requireEditor, type ActionResult } from "./common";

/**
 * Tulis sesi dari Activity Editor ke Supabase. Izin dicek dua kali: di sini (pesan yang
 * jelas) dan oleh RLS (has_permission('activities','edit')) sebagai penjaga utama.
 */

export type SessionInput = {
  id?: string;
  title: string;
  typeSlug: string;
  description: string;
  venueName: string;
  court: string;
  /** Tanggal & jam WIB dari form: "2026-10-18", "07:00". */
  date: string;
  start: string;
  end: string;
  price: number;
  capacity: number;
  points: number;
  levels: TennisLevel[];
  waitlist: boolean;
  membersOnly: boolean;
  status: "draft" | "published" | "scheduled" | "cancelled";
  visibility: "public" | "members" | "link";
  /** "2026-10-18T07:00" (WIB) atau "". */
  visibleUntil: string;
  homepage: boolean;
  /** Link event di Kuyy untuk tombol Booking di website ("" → halaman Soslay di Kuyy). */
  kuyUrl: string;
  /** URL foto cover dari uploadSessionCover, atau null → website memakai foto venue. */
  coverPath: string | null;
  /** Hanya saat membuat sesi baru: buat juga 7 sesi mingguan berikutnya (total 8). */
  repeatWeekly: boolean;
  crew: { name: string; role: "Host" | "Coach" | "Fotografer" }[];
  /** Member yang jadi crew sesi ini: host (akses Panel Host) atau fotografer. */
  crewMembers: { memberId: string; role: "host" | "photographer" }[];
  /** Foto sesi: link album Google Drive, thumbnail (URL upload), jumlah foto. */
  photos: { albumUrl: string; coverPath: string | null; count: number | null };
  play: { matchFormat: MatchFormat; courtCount: number; roundCount: number; targetPoints: number; leaderboardMode: "points" | "wins"; showLeaderboard: boolean };
};

/** Format yang sudah bisa dipakai (v1) — Round robin & Knockout menyusul. */
const ENABLED_FORMATS: MatchFormat[] = ["none", "americano", "rotating"];

const WEEK = 7 * 86_400_000;
const LEVELS: TennisLevel[] = ["beginner", "beginner_intermediate", "intermediate", "intermediate_advanced", "advanced"];
const CREW_ROLE = { Host: "host", Coach: "coach", Fotografer: "photographer" } as const;
/** "kuy.id/soslay/x" → "https://kuy.id/soslay/x"; null kalau bukan URL http(s). */
function normalizeBookingUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function refresh(id?: string) {
  // Website: daftar aktivitas, halaman per tipe (/activity/mabar …), detail venue & homepage.
  refreshPaths("/", "/activity", ["/activity/[type]", "page"], ["/venue/[slug]", "page"], ...(id ? [`/admin/activities/${id}`] : []));
}

function validate(input: SessionInput): string | null {
  if (!input.title.trim()) return "Judul sesi wajib diisi.";
  if (!isActivityType(input.typeSlug)) return "Tipe sesi tidak dikenal.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) return "Tanggal/jam tidak valid.";
  if (!(wib(input.date, input.end) > wib(input.date, input.start))) return "Jam selesai harus setelah jam mulai.";
  if (!Number.isInteger(input.price) || input.price < 0) return "Harga tidak valid.";
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return "Kapasitas minimal 1.";
  if (!Number.isInteger(input.points) || input.points < 0) return "Slay Point tidak valid.";
  if (input.description.length > 500) return "Deskripsi maksimal 500 karakter.";
  if (input.levels.some((l) => !LEVELS.includes(l))) return "Level tidak dikenal.";
  if (input.coverPath && !isCoverUrl(input.coverPath)) return "Foto cover tidak valid.";
  if (input.photos.coverPath && !isCoverUrl(input.photos.coverPath)) return "Foto thumbnail tidak valid.";
  if (input.photos.albumUrl && !isDriveUrl(input.photos.albumUrl)) return "Link album harus link folder Google Drive (drive.google.com).";
  if (input.photos.count !== null && (!Number.isInteger(input.photos.count) || input.photos.count < 0)) return "Jumlah foto tidak valid.";
  if (input.crewMembers.some((c) => c.role !== "host" && c.role !== "photographer")) return "Peran crew tidak dikenal.";
  const { matchFormat, courtCount, roundCount, targetPoints } = input.play;
  if (!ENABLED_FORMATS.includes(matchFormat)) return "Format pertandingan ini belum tersedia.";
  if (matchFormat !== "none") {
    if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 12) return "Jumlah court 1–12.";
    if (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > 40) return "Jumlah ronde 1–40.";
    if (!Number.isInteger(targetPoints) || targetPoints < 1 || targetPoints > 99) return "Target poin 1–99.";
    if (input.play.leaderboardMode !== "points" && input.play.leaderboardMode !== "wins") return "Format leaderboard tidak dikenal.";
  }
  return null;
}

// ── Foto cover ──────────────────────────────────────────────────────────────
// Bucket publik di Supabase Storage (lihat server/storage — dibuat otomatis saat upload pertama).
const COVER_BUCKET = "session-covers";
const COVER_MAX_BYTES = 5 * 1024 * 1024;
/** Link folder / file Google Drive (https). */
const isDriveUrl = (raw: string) => {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && /(^|\.)drive\.google\.com$/.test(url.hostname);
  } catch {
    return false;
  }
};

/** Hanya URL hasil uploadSessionCover di bucket ini — tanpa "../" ke bucket lain. */
const isCoverUrl = (url: string) => isOwnUpload(COVER_BUCKET, url);

export async function uploadSessionCover(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await uploadPublicImage({ bucket: COVER_BUCKET, file: formData.get("file"), folder: monthKey(new Date()), maxBytes: COVER_MAX_BYTES });
  if (!result.ok) return result;

  await audit(auth.userId, "session.cover_upload", "session_cover", result.path);
  return { ok: true, url: result.url };
}

/** Upload cover / thumbnail sesi yang diganti sebelum Simpan → hapus dari Storage (yang masih dipakai sesi mana pun aman). */
export async function discardSessionUploads(urls: string[]): Promise<void> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return;
  await discardUploads(COVER_BUCKET, urls, { table: "sessions", columns: ["cover_path", "photo_cover_path"] });
}

export async function saveSession(input: SessionInput): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createSupabaseServerClient();
  const { data: venue } = await supabase.from("venues").select("id").eq("name", input.venueName).maybeSingle();
  if (!venue) return { ok: false, error: `Venue "${input.venueName}" tidak ditemukan.` };

  const startsAt = wib(input.date, input.start);
  const endsAt = wib(input.date, input.end);
  const bookingUrl = normalizeBookingUrl(input.kuyUrl);
  if (bookingUrl === null) return { ok: false, error: "Link booking Kuy tidak valid — contoh: https://kuy.id/soslay/nama-event" };

  if (input.id) {
    const [{ count }, { data: stored }] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", input.id).in("status", ["registered", "attended", "no_show"]),
      supabase.from("sessions").select("photo_cover_path, photo_count").eq("id", input.id).maybeSingle(),
    ]);
    // Kapasitas tidak boleh di bawah jumlah peserta yang sudah terdaftar.
    if ((count ?? 0) > input.capacity) return { ok: false, error: `Sudah ada ${count} peserta terdaftar — kapasitas minimal ${count}.` };
    // Foto sesi = album Drive + thumbnail: thumbnail / jumlah foto baru tanpa link album ditolak (member butuh
    // link-nya). Hanya saat foto diubah — sesi lama yang sudah begitu tetap bisa disimpan.
    const photosChanged = input.photos.coverPath !== (stored?.photo_cover_path ?? null) || input.photos.count !== (stored?.photo_count ?? null);
    if (photosChanged && !input.photos.albumUrl.trim() && (input.photos.coverPath || input.photos.count !== null)) {
      return { ok: false, error: "Link album Google Drive wajib diisi untuk menyimpan foto sesi." };
    }
  }

  // "Terjadwal" = published tapi baru tampil di website 2 minggu sebelum sesi.
  const scheduled = input.status === "scheduled";
  const publishAt = scheduled ? new Date(startsAt.getTime() - 2 * WEEK) : null;
  const row = {
    title: input.title.trim(),
    type_slug: input.typeSlug,
    description: input.description.trim() || null,
    venue_id: venue.id,
    court_label: input.court || null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    price: input.price,
    capacity: input.capacity,
    points_per_attendance: input.points,
    recommended_levels: input.levels,
    waitlist_enabled: input.waitlist,
    members_only: input.membersOnly,
    status: scheduled ? "published" : input.status,
    visibility: input.visibility,
    publish_at: publishAt && publishAt.getTime() > Date.now() ? publishAt.toISOString() : null,
    visible_until: input.visibleUntil ? new Date(`${input.visibleUntil}:00+07:00`).toISOString() : null,
    show_on_homepage: input.homepage,
    cover_path: input.coverPath,
    kuy_booking_url: bookingUrl || null,
    match_format: input.play.matchFormat,
    court_count: input.play.courtCount,
    round_count: input.play.roundCount,
    target_points: input.play.targetPoints,
    // v1: skor hanya diisi host/admin.
    score_entry: "host",
    leaderboard_mode: input.play.leaderboardMode,
    show_live_leaderboard: input.play.showLeaderboard,
    photo_album_url: input.photos.albumUrl.trim() || null,
    photo_cover_path: input.photos.coverPath,
    photo_count: input.photos.count,
  };

  let id = input.id;
  if (id) {
    const { error } = await supabase.from("sessions").update(row).eq("id", id);
    if (error) return { ok: false, error: `Gagal menyimpan: ${error.message}` };
  } else {
    let seriesId: string | null = null;
    if (input.repeatWeekly) {
      const until = new Date(startsAt.getTime() + 7 * WEEK).toISOString().slice(0, 10);
      const { data: series, error } = await supabase.from("session_series").insert({ repeat_until: until }).select("id").single();
      if (error) return { ok: false, error: `Gagal membuat seri: ${error.message}` };
      seriesId = series.id;
    }
    const base = slugify(`${input.title}-${input.date}`);
    const copies = input.repeatWeekly ? 8 : 1;
    const rows = Array.from({ length: copies }, (_, i) => {
      const shift = i * WEEK;
      const start = new Date(startsAt.getTime() + shift);
      return {
        ...row,
        starts_at: start.toISOString(),
        ends_at: new Date(endsAt.getTime() + shift).toISOString(),
        publish_at: row.publish_at ? new Date(new Date(row.publish_at).getTime() + shift).toISOString() : null,
        visible_until: row.visible_until ? new Date(new Date(row.visible_until).getTime() + shift).toISOString() : null,
        slug: `${i === 0 ? base : slugify(`${input.title}-${start.toISOString().slice(0, 10)}`)}-${crypto.randomUUID().slice(0, 4)}`,
        series_id: seriesId,
        created_by: auth.userId,
      };
    });
    // Hasil INSERT tidak bisa di-.order() → ambil sesi paling awal di sini.
    const { data, error } = await supabase.from("sessions").insert(rows).select("id, starts_at");
    if (error || !data?.length) return { ok: false, error: `Gagal membuat sesi: ${error?.message ?? "tidak ada data"}` };
    id = data.reduce((a, b) => (a.starts_at <= b.starts_at ? a : b)).id as string;
  }

  // Crew: cocokkan nama dengan staf aktif.
  const { error: crewDelete } = await supabase.from("session_crew").delete().eq("session_id", id);
  if (!crewDelete && input.crew.length) {
    const { data: staff } = await supabase.from("staff_members").select("user_id, full_name").in("full_name", input.crew.map((c) => c.name));
    const byName = new Map((staff ?? []).map((s) => [s.full_name as string, s.user_id as string]));
    const crewRows = input.crew.flatMap((c) => (byName.has(c.name) ? [{ session_id: id, staff_id: byName.get(c.name), role: CREW_ROLE[c.role] }] : []));
    if (crewRows.length) await supabase.from("session_crew").insert(crewRows);
  }

  // Album baru pertama kali diisi → catat waktunya (tampil "diunggah …" di halaman member).
  if (input.id && row.photo_album_url) {
    await supabase.from("sessions").update({ photos_posted_at: new Date().toISOString() }).eq("id", id).is("photos_posted_at", null);
  }

  // Crew member: host (hak Panel Host hanya untuk sesi ini, lihat is_session_host) / fotografer.
  const crewMembers = [...new Map(input.crewMembers.map((c) => [c.memberId, c])).values()];
  const hostIds = crewMembers.map((c) => c.memberId);
  const { error: hostDelete } = await supabase
    .from("session_hosts")
    .delete()
    .eq("session_id", id)
    .not("member_id", "in", `(${hostIds.length ? hostIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (hostDelete) return { ok: false, error: `Gagal menyimpan host: ${hostDelete.message}` };
  if (hostIds.length) {
    const { error } = await supabase
      .from("session_hosts")
      .upsert(crewMembers.map((c) => ({ session_id: id, member_id: c.memberId, role: c.role, assigned_by: auth.userId })), { onConflict: "session_id,member_id" });
    if (error) return { ok: false, error: `Gagal menyimpan host: ${error.message}` };
  }

  await audit(auth.userId, input.id ? `mengubah sesi ${input.title}` : `membuat sesi ${input.title}${input.repeatWeekly ? " (8 minggu)" : ""}`, "session", id);
  refresh(id);
  if (!input.id) redirect(`/admin/activities/${id}?saved=${input.repeatWeekly ? "series" : "new"}`);
  return { ok: true, message: savedMessage(row) };
}

const VISIBILITY_SUFFIX = { public: "", members: " (khusus member yang login)", link: " (hanya lewat link)" } as const;
const publishAtFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Pesan simpan sesuai status — Draft/Dibatalkan/terjadwal belum (atau tidak) tampil di website. */
function savedMessage(row: { status: string; publish_at: string | null; visibility: SessionInput["visibility"] }): string {
  if (row.status === "draft") return "Tersimpan sebagai Draft — belum tampil di website. Ubah Status ke Published untuk menampilkannya.";
  if (row.status === "cancelled") return "Tersimpan · sesi Dibatalkan tidak tampil di website.";
  if (row.publish_at) return `Tersimpan · tampil otomatis di website mulai ${publishAtFmt.format(new Date(row.publish_at))} WIB.`;
  return `Tersimpan dan sudah tampil di website${VISIBILITY_SUFFIX[row.visibility]}.`;
}

/** Hapus sesi — hanya bila belum ada peserta; kalau sudah ada, pakai status Dibatalkan. */
export async function deleteSession(id: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", id).neq("status", "cancelled");
  if (count) return { ok: false, error: `Sesi punya ${count} peserta — ubah status ke "Dibatalkan" saja.` };
  const { data: gone, error } = await supabase.from("sessions").delete().eq("id", id).select("title");
  if (error) return { ok: false, error: `Gagal menghapus: ${error.message}` };
  await audit(auth.userId, `menghapus sesi ${gone?.[0]?.title ?? ""}`.trim(), "session", id);
  refresh();
  redirect("/admin/activities?deleted=1");
}

/**
 * Check-in / batal check-in peserta. Peserta import Kuyy lewat RPC (admin atau host sesi);
 * peserta dari booking (tanpa import) langsung di bookings. Poin kehadiran diberi/ditarik
 * oleh trigger database.
 */
export async function setCheckIn(sessionId: string, participant: { id: string; memberId: string | null }, checkedIn: boolean): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const fromRoster = participant.id !== participant.memberId;
  if (fromRoster) {
    const { error } = await supabase.rpc("set_participant_check_in", { p_participant: participant.id, p_checked_in: checkedIn });
    if (error) return { ok: false, error: `Check-in gagal: ${error.message}` };
  } else {
    const { data, error } = await supabase
      .from("bookings")
      .update(checkedIn ? { status: "attended", checked_in_at: new Date().toISOString(), checked_in_by: auth.userId } : { status: "registered", checked_in_at: null, checked_in_by: null })
      .eq("session_id", sessionId)
      .eq("member_id", participant.memberId!)
      .neq("status", "waitlisted")
      .select("id");
    if (error || !data?.length) return { ok: false, error: `Check-in gagal: ${error?.message ?? "booking tidak ditemukan"}` };
  }
  refresh(sessionId);
  const points = participant.memberId ? (checkedIn ? " · Slay Point ditambahkan." : " · Slay Point ditarik.") : ".";
  return { ok: true, message: (checkedIn ? "Check-in tersimpan" : "Check-in dibatalkan") + points };
}
