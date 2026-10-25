/**
 * Sesi login dipisah per area: dashboard admin dan website member memakai cookie Supabase
 * yang berbeda, jadi satu browser bisa login sebagai member di website sekaligus sebagai tim
 * di /admin tanpa saling menimpa.
 *
 * - member: cookie bawaan Supabase (sesi member yang sudah ada tetap berlaku)
 * - admin : cookie terpisah untuk /admin & /masuk/admin
 */
export type AuthScope = "member" | "admin";

/** Nama cookie sesi admin. `undefined` = nama bawaan Supabase (sb-<project>-auth-token). */
export const SCOPE_COOKIE: Record<AuthScope, string | undefined> = {
  member: undefined,
  admin: "sb-soslay-admin-auth-token",
};

/** Header internal yang diisi proxy untuk memberi tahu server scope request ini. */
export const SCOPE_HEADER = "x-soslay-auth-scope";

export function scopeForPath(pathname: string): AuthScope {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/masuk/admin" ? "admin" : "member";
}

export const cookieOptionsFor = (scope: AuthScope) => (SCOPE_COOKIE[scope] ? { name: SCOPE_COOKIE[scope] } : undefined);
