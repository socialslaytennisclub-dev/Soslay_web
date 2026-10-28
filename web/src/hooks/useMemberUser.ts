"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";

export type MemberUser = { name: string };

/**
 * Sesi member dibaca langsung dari cookie Supabase (`sb-<project>-auth-token`, bisa dipecah
 * `.0`, `.1`, …; isi "base64-<json>"). Sengaja TANPA klien Supabase di browser: klien auth
 * memakai Web Locks (`navigator.locks`, termasuk `steal`) + timer refresh token di setiap
 * halaman, dan perebutan kunci itu membuat Chrome 156 crash (proses browser). Navbar hanya
 * butuh nama untuk ditampilkan — keamanan data tetap di server (proxy + RLS).
 */
function readMemberCookie(): MemberUser | null {
  const base = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const jar = new Map(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), c.slice(i + 1)] as const;
      }),
  );
  let raw = jar.get(base) ?? "";
  // Sesi besar disimpan berpotongan: sb-…-auth-token.0, .1, … → gabungkan berurutan.
  for (let i = 0; !jar.has(base) && jar.has(`${base}.${i}`); i++) raw += jar.get(`${base}.${i}`);
  if (!raw) return null;
  try {
    raw = decodeURIComponent(raw);
    const json = raw.startsWith("base64-") ? base64UrlDecode(raw.slice(7)) : raw;
    const session = JSON.parse(json) as { user?: { email?: string; user_metadata?: { display_name?: string; full_name?: string } } };
    const user = session.user;
    if (!user) return null;
    return { name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Member" };
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
}

/** Member yang login di website (cookie sesi member, bukan admin). null = belum login. */
export function useMemberUser() {
  const [user, setUser] = useState<MemberUser | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const read = () => setUser(readMemberCookie());
    read();
    // Login / keluar di tab lain → perbarui saat tab ini dibuka lagi.
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return user;
}
