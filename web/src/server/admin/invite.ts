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
  | { ok: false; reason: "no_service_key" | "taken" | "rate_limited" | "error"; error: string };

/** Origin permintaan sekarang — dasar link /auth/undangan di email. */
export async function requestOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export async function inviteMemberByEmail(input: InviteInput, origin: string): Promise<InviteResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "no_service_key", error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang di server." };

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
  if (/rate limit|too many/i.test(message)) return { ok: false, reason: "rate_limited", error: message };
  if (/already|registered|exists/i.test(message)) return { ok: false, reason: "taken", error: message };
  return { ok: false, reason: "error", error: message };
}
