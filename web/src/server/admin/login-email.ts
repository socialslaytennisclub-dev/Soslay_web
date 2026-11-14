import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type LoginEmailStatus = { email: string; confirmed: boolean } | null;

/**
 * Email login & status konfirmasi akun Auth member — untuk tombol "Ganti email login" di detail member.
 * Panggil hanya setelah cek izin members edit. null = tanpa service key / belum punya akun.
 */
export async function getLoginEmailStatus(memberId: string): Promise<LoginEmailStatus> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.auth.admin.getUserById(memberId);
  return data?.user ? { email: data.user.email ?? "", confirmed: !!data.user.email_confirmed_at } : null;
}
