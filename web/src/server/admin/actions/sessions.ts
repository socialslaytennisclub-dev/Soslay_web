"use server";

import { redirect } from "next/navigation";
import { isActivityType } from "@/content/activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monthKey } from "../time";
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
  /** URL foto cover dari uploadSessionCover, atau null → website memakai foto venue. */
  coverPath: string | null;
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
  return null;
}

// ── Foto cover ──────────────────────────────────────────────────────────────
// Bucket publik di Supabase Storage; dibuat otomatis saat upload pertama (tanpa migrasi,
// karena skema `storage` tidak ada di PGlite check-migrations). Upload lewat service role
// setelah requireEditor, jadi tidak perlu policy RLS di storage.objects.
const COVER_BUCKET = "session-covers";
const COVER_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const COVER_MAX_BYTES = 5 * 1024 * 1024;
/** Hanya URL hasil uploadSessionCover: <bucket publik>/<YYYY-MM>/<uuid>.<ext> — tanpa "../" ke bucket lain. */
const COVER_KEY = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const isCoverUrl = (url: string) => {
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${COVER_BUCKET}/`;
  return url.startsWith(prefix) && COVER_KEY.test(url.slice(prefix.length));
};

export async function uploadSessionCover(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file foto dulu." };
  const ext = COVER_TYPES[file.type];
  if (!ext) return { ok: false, error: "Format harus JPG, PNG, atau WebP." };
  if (file.size > COVER_MAX_BYTES) return { ok: false, error: "Ukuran foto maksimal 5 MB." };

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Upload belum aktif: SUPABASE_SERVICE_ROLE_KEY belum dipasang." };

  const path = `${monthKey(new Date())}/${crypto.randomUUID()}.${ext}`;
  const upload = () => admin.storage.from(COVER_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  let { error } = await upload();
  // Upload pertama di project baru: bucket belum ada → buat sekali, lalu ulangi.
  if (error && /bucket not found/i.test(error.message)) {
    const created = await admin.storage.createBucket(COVER_BUCKET, {
      public: true,
      fileSizeLimit: COVER_MAX_BYTES,
      allowedMimeTypes: Object.keys(COVER_TYPES),
    });
    if (created.error && !/already exists/i.test(created.error.message)) return { ok: false, error: `Gagal menyiapkan Storage: ${created.error.message}` };
    ({ error } = await upload());
  }
  if (error) return { ok: false, error: `Gagal upload: ${error.message}` };

  await audit(auth.userId, "session.cover_upload", "session_cover", path);
  return { ok: true, url: admin.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl };
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
    cover_path: input.coverPath,
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
