"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { cookieOptionsFor, type AuthScope } from "./scope";

/**
 * Klien Supabase di browser (anon key + sesi user). Tidak pernah memakai service role.
 * `scope` memilih cookie sesi: member (bawaan) atau admin — keduanya terpisah.
 */
export function createSupabaseBrowserClient(scope: AuthScope = "member") {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions: cookieOptionsFor(scope), isSingleton: false });
}
