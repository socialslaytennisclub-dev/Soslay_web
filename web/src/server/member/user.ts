import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Klien Supabase sesi member + user yang login — satu panggilan Auth per request, dipakai
 * bersama header member, daftar sesi & detail sesi.
 */
export const getMemberSession = cache(async () => {
  const supabase = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
