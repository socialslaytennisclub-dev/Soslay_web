import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Klien Supabase untuk Server Component, Server Action & Route Handler — memakai sesi
 * user (cookie), jadi semua query tunduk pada RLS. Satu klien per request (React cache).
 */
export const createSupabaseServerClient = cache(async () => {
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Dipanggil dari Server Component (cookie read-only) — sesi di-refresh oleh proxy.
        }
      },
    },
  });
});
