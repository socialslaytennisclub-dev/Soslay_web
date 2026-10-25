import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { cookieOptionsFor, SCOPE_HEADER, type AuthScope } from "./scope";

/**
 * Klien Supabase untuk Server Component, Server Action & Route Handler — memakai sesi
 * user (cookie), jadi semua query tunduk pada RLS. Satu klien per request (React cache).
 *
 * Sesi admin & member terpisah (lihat ./scope): request di /admin & /masuk/admin memakai
 * cookie admin, sisanya cookie member. Scope dibaca dari header yang diisi proxy.
 */
export const createSupabaseServerClient = cache(async (scopeOverride?: AuthScope) => {
  const [store, h] = await Promise.all([cookies(), headers()]);
  const scope: AuthScope = scopeOverride ?? (h.get(SCOPE_HEADER) === "admin" ? "admin" : "member");
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(scope),
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
