"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type MemberUser = { name: string };

/** Satu pembacaan per muat halaman — dipakai bersama semua Navbar di halaman itu. */
let pending: Promise<MemberUser | null> | null = null;

async function loadMemberUser(): Promise<MemberUser | null> {
  const supabase = createSupabaseBrowserClient("member");
  // getSession hanya membaca cookie (tanpa request); keamanan data tetap dijaga RLS di server.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.from("profiles").select("full_name, display_name").eq("id", session.user.id).maybeSingle();
  const name = data?.display_name || data?.full_name || (session.user.user_metadata?.full_name as string | undefined) || session.user.email || "Member";
  return { name };
}

/**
 * Member yang login di website (cookie sesi member, bukan admin). Navbar dipakai juga di halaman
 * statis, jadi status login dibaca di browser setelah halaman tampil: null = belum login / memuat.
 */
export function useMemberUser() {
  const [user, setUser] = useState<MemberUser | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    pending ??= loadMemberUser().catch(() => null);
    pending.then((u) => active && setUser(u));
    const supabase = createSupabaseBrowserClient("member");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      pending = event === "SIGNED_OUT" ? Promise.resolve(null) : loadMemberUser().catch(() => null);
      pending.then((u) => active && setUser(u));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return user;
}
