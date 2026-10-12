"use server";

import { redirect } from "next/navigation";
import { isActivityType } from "@/content/activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TennisLevel } from "../types";
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
  /** Hanya saat membuat sesi baru: buat juga 7 sesi mingguan berikutnya (total 8). */
  repeatWeekly: boolean;
  crew: { name: string; role: "Host" | "Coach" | "Fotografer" }[];
};

const WEEK = 7 * 86_400_000;
const LEVELS: TennisLevel[] = ["beginner", "beginner_intermediate", "intermediate", "intermediate_advanced", "advanced"];
const CREW_ROLE = { Host: "host", Coach: "coach", Fotografer: "photographer" } as const;
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function refresh(id?: string) {
  refreshPaths("/activity", ["/venue/[slug]", "page"], ...(id ? [`/admin/activities/${id}`] : []));
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
  return null;
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

  // Kapasitas tidak boleh di bawah jumlah peserta yang sudah terdaftar.
  if (input.id) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.id)
      .in("status", ["registered", "attended", "no_show"]);
    if ((count ?? 0) > input.capacity) return { ok: false, error: `Sudah ada ${count} peserta terdaftar — kapasitas minimal ${count}.` };
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
    const { data, error } = await supabase.from("sessions").insert(rows).select("id").order("starts_at");
    if (error || !data?.length) return { ok: false, error: `Gagal membuat sesi: ${error?.message ?? "tidak ada data"}` };
    id = data[0].id as string;
  }

  // Crew: cocokkan nama dengan staf aktif.
  const { error: crewDelete } = await supabase.from("session_crew").delete().eq("session_id", id);
  if (!crewDelete && input.crew.length) {
    const { data: staff } = await supabase.from("staff_members").select("user_id, full_name").in("full_name", input.crew.map((c) => c.name));
    const byName = new Map((staff ?? []).map((s) => [s.full_name as string, s.user_id as string]));
    const crewRows = input.crew.flatMap((c) => (byName.has(c.name) ? [{ session_id: id, staff_id: byName.get(c.name), role: CREW_ROLE[c.role] }] : []));
    if (crewRows.length) await supabase.from("session_crew").insert(crewRows);
  }

  await audit(auth.userId, input.id ? `mengubah sesi ${input.title}` : `membuat sesi ${input.title}${input.repeatWeekly ? " (8 minggu)" : ""}`, "session", id);
  refresh(id);
  if (!input.id) redirect(`/admin/activities/${id}?saved=${input.repeatWeekly ? "series" : "new"}`);
  return { ok: true, message: "Perubahan tersimpan dan sudah tampil di website." };
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

/** Check-in / batal check-in peserta. Poin kehadiran diberi/ditarik oleh trigger database. */
export async function setCheckIn(sessionId: string, memberId: string, checkedIn: boolean): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .update(checkedIn ? { status: "attended", checked_in_at: new Date().toISOString(), checked_in_by: auth.userId } : { status: "registered", checked_in_at: null, checked_in_by: null })
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .neq("status", "waitlisted")
    .select("id");
  if (error || !data?.length) return { ok: false, error: `Check-in gagal: ${error?.message ?? "booking tidak ditemukan"}` };
  refresh(sessionId);
  return { ok: true, message: checkedIn ? "Check-in tersimpan · Slay Point ditambahkan." : "Check-in dibatalkan · Slay Point ditarik." };
}
