import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Klien Supabase sesi member + user yang login — satu verifikasi per request, dipakai bersama header
 * member, daftar sesi & detail sesi.
 *
 * Identitas dari getClaims() (sama dengan proxy & sesi admin): JWT diverifikasi lokal dengan kunci publik
 * project (ES256, JWKS di-cache per proses), tanpa round-trip ±200 ms ke Supabase Auth seperti getUser() —
 * terasa di setiap pindah tab / menu member. Pemanggil hanya memakai `user.id`; data member tetap dibaca
 * lewat RLS dengan JWT yang sama.
 */
export const getMemberSession = cache(async () => {
  const supabase = await createSupabaseServerClient("member");
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims.sub;
  return { supabase, user: sub ? { id: sub } : null };
});
