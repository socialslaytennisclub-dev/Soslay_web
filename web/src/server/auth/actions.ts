"use server";

import { redirect } from "next/navigation";
import { AFTER_AUTH } from "@/content/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Hanya path internal ("/admin", "/akun?x=1") — cegah open redirect lewat ?next=. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : AFTER_AUTH;
}

export type SignInResult = { error: string } | undefined;

export async function signIn(email: string, password: string, next?: string): Promise<SignInResult> {
  if (!isSupabaseConfigured) redirect(safeNext(next));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.code === "invalid_credentials" ? "Email atau password salah." : "Belum bisa masuk. Coba lagi sebentar." };
  }
  redirect(safeNext(next));
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/masuk");
}
