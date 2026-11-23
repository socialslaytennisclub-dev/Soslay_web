import "server-only";
import { cookies, headers } from "next/headers";
import { AFTER_AUTH, AFTER_CONFIRM_COOKIE } from "@/content/auth";
import { isInternalPath, safeNext } from "@/lib/safe-path";

/** Tujuan link konfirmasi email: daftar biasa, kirim ulang, dan Order Now memakai aturan yang sama. */

/** Origin absolut untuk link di email: Origin dari browser, cadangan Host (+ proto dari proxy Vercel). */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "");
}

/** Link di email konfirmasi signup — tujuan sama dengan signUp (`next`, mis. /game, atau /akun). */
export async function signupRedirect(next?: string) {
  return `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(safeNext(next, AFTER_AUTH))}`;
}

/**
 * Template email Supabase menulis `next=/akun` sendiri (tidak memakai emailRedirectTo), jadi tujuan
 * khusus setelah verifikasi (mis. /game) dititipkan di cookie — dibaca /auth/confirm di browser yang
 * sama. Dipanggil setiap kali link konfirmasi dikirim.
 */
export async function rememberAfterConfirm(next?: string) {
  const jar = await cookies();
  if (isInternalPath(next) && next !== AFTER_AUTH) {
    jar.set(AFTER_CONFIRM_COOKIE, next, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 });
  } else {
    jar.delete(AFTER_CONFIRM_COOKIE);
  }
}
