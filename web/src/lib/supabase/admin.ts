import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Klien service role — untuk operasi Auth yang butuh hak admin (undang staf) dan pencarian
 * identitas member (lib server/admin/identity) — selalu SETELAH requireEditor.
 * Kunci dibaca dari SUPABASE_SERVICE_ROLE_KEY (server env), tidak pernah dikirim ke browser.
 * Mengembalikan null bila kunci belum dipasang.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
