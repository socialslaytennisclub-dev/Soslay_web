import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tutup sungguhan sesi yang sudah lewat jeda (RPC close_expired_sessions: status completed +
 * bonus juara). pg_cron menjalankannya tiap 5 menit; ini cadangan saat halaman membaca sesi yang
 * sudah lewat jeda tapi belum tertutup (cron belum jalan / tidak tersedia). Gagal → diabaikan:
 * tampilan tetap benar karena "selesai" juga diturunkan dari jam (lib/session-close).
 */
export async function closeExpiredSessions(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("close_expired_sessions");
  if (error) {
    console.warn(`[closeExpiredSessions] ${error.message}`);
    return false;
  }
  return (data as number | null) ? true : false;
}
