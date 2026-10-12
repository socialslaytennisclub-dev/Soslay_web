import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Klien anon tanpa cookie untuk data publik website (sesi, venue, produk, konten). Tidak
 * membaca sesi user → halaman publik tetap bisa di-cache/ISR. RLS hanya membuka data publik.
 */
export function createSupabasePublicClient() {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
