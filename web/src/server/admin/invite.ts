import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Undangan member lewat email (Supabase Auth invite). Metadata `signup: "member"` → trigger
 * handle_member_signup membuat profilnya, sama seperti daftar di website. Member membuka link
 * di email, membuat password, lalu masuk ke /akun. Dipakai "Tambah member" & impor peserta Kuyy.
 */

export type InviteInput = { fullName: string; email: string; phone?: string; kuyId?: string; city?: string; level?: string };

export type InviteResult =
  | { ok: true; userId: string }
  /** email_failed = SMTP menolak / batas kirim email tercapai — akun TIDAK dibuat. */
  /** member = email sudah punya profil member (error = nama lengkapnya). */
  | { ok: false; reason: "no_service_key" | "member" | "taken" | "email_failed" | "error"; error: string };

/** Origin permintaan sekarang — dasar link /auth/undangan di email. */
export async function requestOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export async function inviteMemberByEmail(input: InviteInput, origin: string): Promise<InviteResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "no_service_key", error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang di server." };

  // Email yang sudah punya profil tidak diundang ulang. Sekaligus pengaman pembersihan di bawah: akun yang
  // SUDAH ada (mis. diundang kemarin, belum login) tidak boleh ikut terhapus — cek gagal = berhenti.
  const before = await admin.from("profiles").select("full_name").eq("email", input.email).maybeSingle();
  if (before.error) return { ok: false, reason: "error", error: before.error.message };
  if (before.data) return { ok: false, reason: "member", error: before.data.full_name as string };
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${origin}/auth/undangan`,
    data: {
      signup: "member",
      full_name: input.fullName,
      phone: input.phone ?? "",
      kuy_id: input.kuyId ?? "",
      city: input.city ?? "",
      tennis_level: input.level ?? "",
    },
  });
  if (data?.user && !error) return { ok: true, userId: data.user.id };

  const message = error?.message ?? "coba lagi";
  if (/already|registered|exists/i.test(message)) return { ok: false, reason: "taken", error: message };
  // Gagal KIRIM email (bukan data tidak valid): SMTP bawaan Supabase hanya mengirim ke email tim &
  // dibatasi per jam. Pesan GoTrue: "Error sending invite email", "email rate limit exceeded",
  // "Email address not authorized" (SMTP bawaan), atau 429.
  if (!/rate limit|too many|error sending|not authorized|smtp/i.test(message)) return { ok: false, reason: "error", error: message };

  // Pastikan tidak ada user Auth setengah jadi (versi GoTrue tertentu tidak me-rollback user saat kirim
  // email gagal) — kalau tertinggal, orangnya tidak bisa daftar sendiri di /daftar. Profil dibuat trigger
  // dari user Auth dengan id yang sama; sebelum undangan profil ini belum ada (dicek di atas), jadi ini user
  // dari panggilan ini — yang belum pernah login aman dihapus.
  const { data: leftover } = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  if (leftover) {
    const { data: found } = await admin.auth.admin.getUserById(leftover.id as string);
    if (!found.user || found.user.last_sign_in_at) return { ok: false, reason: "taken", error: message };
    // Profil baru mungkin sudah mengklaim ghost (claim_ghost_member) → booking & poin dari klaim itu ikut
    // terhapus bersama profil (cascade). Kembalikan ghost ke status belum diklaim supaya klaim berikutnya
    // (saat dia daftar sendiri) membuat ulang booking & poinnya.
    const { data: claimed } = await admin.from("ghost_members").select("id").eq("claimed_by", found.user.id);
    const { error: deleteError } = await admin.auth.admin.deleteUser(found.user.id);
    if (deleteError) return { ok: false, reason: "error", error: `${message} (akun sisa gagal dibersihkan: ${deleteError.message})` };
    if (claimed?.length) {
      await admin.from("ghost_members").update({ claimed_by: null, claimed_at: null }).in("id", claimed.map((g) => g.id as string));
    }
  }
  return { ok: false, reason: "email_failed", error: message };
}
