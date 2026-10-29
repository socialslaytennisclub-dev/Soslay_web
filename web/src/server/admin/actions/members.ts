"use server";

import { isEmail } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changedPhoneError, localPhone, phoneFormatError } from "@/lib/wa-invite";
import { inviteMemberByEmail, requestOrigin } from "../invite";
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

export type NewMemberInput = { fullName: string; email: string; phone: string; kuyId: string; city: string; level: string };

/** Email undangan gagal → data disimpan sebagai ghost member; admin mengundang daftar lewat WhatsApp. */
export type AddMemberResult = ActionResult | { ok: true; message: string; signupInvite: { name: string; phone: string } };

/**
 * Tambah member dari admin: buat akun Auth lewat email undangan (butuh SUPABASE_SERVICE_ROLE_KEY).
 * Metadata `signup: "member"` → trigger handle_member_signup membuat profilnya, sama seperti daftar
 * di website. Member membuka link di email, membuat password, lalu masuk ke /akun.
 * Email gagal terkirim → akun tidak dibuat; data jadi calon member (ghost) + undangan daftar via WhatsApp.
 */
export async function addMember(input: NewMemberInput): Promise<AddMemberResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const kuyId = input.kuyId.trim();
  const phone = localPhone(input.phone);
  if (!fullName) return fail("Isi nama lengkap member.");
  if (!isEmail(email)) return fail("Email tidak valid.");
  const phoneError = phoneFormatError(input.phone);
  if (phoneError) return fail(phoneError);

  // Tanpa service key member tidak bisa ditambah — tetap beri tahu kalau emailnya ternyata sudah member.
  if (!createSupabaseAdminClient()) {
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase.from("profiles").select("full_name").eq("email", email).maybeSingle();
    return fail(existing ? `Email ini sudah terdaftar sebagai member (${existing.full_name}).` : "Tambah member belum aktif: SUPABASE_SERVICE_ROLE_KEY belum dipasang di server.");
  }
  if (kuyId) {
    const supabase = await createSupabaseServerClient();
    const { data: kuyFree } = await supabase.rpc("kuy_id_available", { p_kuy_id: kuyId });
    if (kuyFree === false) return fail(`Kuy ID @${kuyId} sudah dipakai member lain.`);
  }

  const invite = await inviteMemberByEmail(
    { fullName, email, phone, kuyId, city: input.city.trim(), level: orNull(input.level, ENUMS.level) ?? "" },
    await requestOrigin(),
  );
  if (!invite.ok) {
    // Profil dengan email ini dicek di inviteMemberByEmail (service role — juga melihat profil di luar RLS admin).
    if (invite.reason === "member") return fail(`Email ini sudah terdaftar sebagai member (${invite.error}).`);
    if (invite.reason === "taken") return fail("Email ini sudah punya akun Soslay (mis. akun tim) — minta dia daftar sendiri atau hubungi Super Admin.");
    if (invite.reason === "email_failed") {
      // Akun TIDAK dibuat (link login tidak pernah dipegang admin). Data disimpan sebagai ghost member →
      // trigger claim_ghost_member menautkannya otomatis saat dia daftar sendiri (email / telepon / Kuy ID).
      console.warn(`[addMember] email undangan gagal: ${invite.error}`);
      const saved = await saveGhost({ fullName, email, phone, kuyId, level: orNull(input.level, ENUMS.level) });
      if (!saved.ok) return fail(`Email undangan gagal terkirim (${invite.error}) dan data belum tersimpan: ${saved.error}`);
      await audit(auth.userId, `mencatat calon member ${fullName} (email undangan gagal)`, "ghost_member", saved.id);
      return {
        ok: true,
        message: `Email undangan ke ${email} gagal terkirim. Data ${fullName} disimpan — undang dia daftar lewat WhatsApp; akunnya otomatis tersambung saat dia daftar.`,
        signupInvite: { name: fullName, phone },
      };
    }
    return fail(`Gagal membuat akun: ${invite.error}`);
  }
  await audit(auth.userId, `menambah member ${fullName}`, "member", invite.userId);
  refreshPaths("/admin/members");
  return done(`${fullName} ditambahkan. Undangan terkirim ke ${email} — dia tinggal klik link di email dan membuat password.`);
}

/** Simpan / perbarui ghost member (belum punya akun) — lewat service role karena izin tulis ghost = activities. */
async function saveGhost(g: { fullName: string; email: string; phone: string; kuyId: string; level: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang" };
  // Dicocokkan lewat email saja: nomor HP bisa dipakai bersama (pembeli Kuyy yang membelikan tiket
  // pasangannya) — mencocokkan nomor akan menimpa data calon member orang lain.
  const [{ data: known }, { data: kuyOwner }] = await Promise.all([
    admin.from("ghost_members").select("id").is("claimed_by", null).eq("email", g.email).order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
    g.kuyId ? admin.from("ghost_members").select("id").eq("kuy_id", g.kuyId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const row = {
    full_name: g.fullName,
    email: g.email,
    phone: g.phone || null,
    tennis_level: g.level,
    last_seen_at: new Date().toISOString(),
    // Kuy ID unik di ghost_members — lewati bila sudah dipakai ghost lain.
    ...(g.kuyId && (!kuyOwner || kuyOwner.id === known?.id) ? { kuy_id: g.kuyId } : {}),
  };
  const { data, error } = known
    ? await admin.from("ghost_members").update(row).eq("id", known.id).select("id").single()
    : await admin.from("ghost_members").insert(row).select("id").single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id as string };
}

export async function updateMember(input: MemberForm): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!input.fullName.trim()) return fail("Nama wajib diisi.");
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return fail("Tanggal lahir tidak valid.");
  const supabase = await createSupabaseServerClient();
  // Nomor lama yang tidak diubah tetap boleh disimpan — data tersimpan hanya dibaca kalau format nomornya ditolak.
  if (phoneFormatError(input.phone)) {
    const { data: stored } = await supabase.from("profiles").select("phone").eq("id", input.id).maybeSingle();
    const phoneError = changedPhoneError(input.phone, stored?.phone as string | null | undefined);
    if (phoneError) return fail(phoneError);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: localPhone(input.phone) || null,
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
