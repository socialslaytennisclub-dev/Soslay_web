"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberForm, MembersQuery } from "../types";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** CRM: ubah data member, catatan internal, penyesuaian poin, booking oleh admin, segmen. */

const ENUMS = {
  gender: ["male", "female", "undisclosed"],
  level: ["beginner", "beginner_intermediate", "intermediate", "intermediate_advanced", "advanced"],
  frequency: ["rarely", "monthly", "weekly", "twice_weekly", "often"],
  format: ["singles", "doubles", "both"],
  hand: ["right", "left", "both"],
};
const orNull = (v: string, allowed: string[]) => (allowed.includes(v) ? v : null);

function refreshMember(id: string) {
  refreshPaths("/admin/members", `/admin/members/${id}`);
}

export async function updateMember(input: MemberForm): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!input.fullName.trim()) return fail("Nama wajib diisi.");
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return fail("Tanggal lahir tidak valid.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.replace(/\D/g, "").replace(/^(62|0)/, "") || null,
      city: input.city.trim() || null,
      birth_date: input.birthDate || null,
      gender: orNull(input.gender, ENUMS.gender),
      kuy_id: input.kuyId.trim() || null,
      instagram: input.instagram.trim().replace(/^@/, "") || null,
      tennis_level: orNull(input.level, ENUMS.level),
      play_frequency: orNull(input.playFrequency, ENUMS.frequency),
      play_format: orNull(input.playFormat, ENUMS.format),
      dominant_hand: orNull(input.hand, ENUMS.hand),
      playing_since: input.playingSince.trim() || null,
      status: input.status,
    })
    .eq("id", input.id);
  if (error) return fail(error.code === "23505" ? "Kuy ID sudah dipakai member lain." : `Gagal menyimpan: ${error.message}`);
  await audit(auth.userId, `mengubah data member ${input.fullName.trim()}${input.status === "suspended" ? " (ditangguhkan)" : ""}`, "member", input.id);
  refreshMember(input.id);
  return done("Data member tersimpan.");
}

/** Tambah/kurangi Slay Point manual (kompensasi, koreksi). Tercatat di ledger, tier menyesuaikan otomatis. */
export async function adjustPoints(memberId: string, delta: number, note: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) return fail("Jumlah poin tidak valid.");
  if (!note.trim()) return fail("Tulis alasan penyesuaian poin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("points_ledger")
    .insert({ member_id: memberId, delta, reason: delta > 0 ? "bonus" : "adjustment", note: note.trim(), created_by: auth.userId });
  if (error) return fail(`Gagal menyimpan poin: ${error.message}`);
  await audit(auth.userId, `${delta > 0 ? "menambah" : "mengurangi"} ${Math.abs(delta)} Slay Point`, "member", memberId);
  refreshMember(memberId);
  return done(`${delta > 0 ? "+" : ""}${delta} Slay Point tersimpan.`);
}

export async function addMemberNote(memberId: string, body: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const text = body.trim();
  if (!text || text.length > 2000) return fail("Catatan 1–2000 karakter.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("member_notes").insert({ member_id: memberId, author_id: auth.userId, body: text });
  if (error) return fail(`Gagal menyimpan catatan: ${error.message}`);
  refreshMember(memberId);
  return done("Catatan tersimpan.");
}

export async function deleteMemberNote(memberId: string, noteId: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("member_notes").delete().eq("id", noteId).eq("member_id", memberId);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  refreshMember(memberId);
  return done("Catatan dihapus.");
}

/** Daftarkan member ke sesi dari admin (mis. lewat WhatsApp). Butuh izin Activities. */
export async function bookMemberIntoSession(memberId: string, sessionId: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const [{ data: session }, { count }] = await Promise.all([
    supabase.from("sessions").select("title, capacity, price, waitlist_enabled, status, starts_at").eq("id", sessionId).maybeSingle(),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", sessionId).in("status", ["registered", "attended", "no_show"]),
  ]);
  if (!session || session.status !== "published") return fail("Sesi tidak tersedia.");
  const full = (count ?? 0) >= (session.capacity as number);
  if (full && !session.waitlist_enabled) return fail("Sesi sudah penuh dan waitlist tidak aktif.");

  const { error } = await supabase.from("bookings").upsert(
    { session_id: sessionId, member_id: memberId, status: full ? "waitlisted" : "registered", payment_status: "pending", source: "admin", amount: session.price },
    { onConflict: "session_id,member_id" },
  );
  if (error) return fail(`Gagal booking: ${error.message}`);
  await audit(auth.userId, `booking-kan member ke ${session.title}`, "booking", sessionId);
  refreshPaths(`/admin/members/${memberId}`, `/admin/activities/${sessionId}`, "/admin/activities");
  return done(full ? `Sesi penuh — member masuk waitlist ${session.title}.` : `Member terdaftar di ${session.title} (pembayaran: menunggu).`);
}

export async function saveSegment(name: string, query: MembersQuery): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!name.trim()) return fail("Beri nama segmen.");
  // Simpan filternya saja (tanpa halaman & urutan).
  const filter: MembersQuery = { tab: query.tab, q: query.q, tier: query.tier, level: query.level, city: query.city, frequency: query.frequency, interest: query.interest };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("member_segments").insert({ name: name.trim().slice(0, 60), filter, created_by: auth.userId });
  if (error) return fail(`Gagal menyimpan segmen: ${error.message}`);
  refreshPaths("/admin/members");
  return done(`Segmen "${name.trim()}" tersimpan.`);
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("member_segments").delete().eq("id", id);
  if (error) return fail(`Gagal menghapus segmen: ${error.message}`);
  refreshPaths("/admin/members");
  return done("Segmen dihapus.");
}
