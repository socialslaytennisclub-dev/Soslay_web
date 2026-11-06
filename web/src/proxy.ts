import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { cookieOptionsFor, SCOPE_HEADER, scopeForPath } from "@/lib/supabase/scope";

/**
 * Refresh sesi Supabase di halaman yang memakai sesi (lihat matcher) + cek optimistis untuk /admin
 * dan area member /akun.
 * Otorisasi sebenarnya (role & izin modul) tetap di server: layout admin + RLS.
 * Tanpa env Supabase, proxy tidak melakukan apa-apa (mode demo).
 *
 * Sesi admin & member terpisah: /admin & /masuk/admin memakai cookie admin, sisanya cookie
 * member (lihat lib/supabase/scope). Scope diteruskan ke server lewat header SCOPE_HEADER.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  const { pathname, search, searchParams } = request.nextUrl;
  // Link email Supabase yang gagal (kedaluwarsa / sudah dipakai) kembali dengan ?error_code=… ke
  // halaman mana pun (biasanya beranda) → arahkan ke Lupa password untuk minta link baru.
  if (searchParams.has("error_code") && pathname !== "/lupa-password") {
    const retry = request.nextUrl.clone();
    retry.pathname = "/lupa-password";
    retry.search = `?link=${searchParams.get("error_code") === "otp_expired" ? "expired" : "invalid"}`;
    return NextResponse.redirect(retry);
  }
  const scope = scopeForPath(pathname);
  // Header scope selalu ditimpa di sini — nilai kiriman browser tidak dipercaya.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(SCOPE_HEADER, scope);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(scope),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims: refresh token bila kedaluwarsa (cookie baru lewat setAll), lalu verifikasi JWT secara
  // lokal dengan JWKS project (ES256, di-cache per proses). getUser() round-trip ke Supabase Auth
  // (±200 ms) di SETIAP request, termasuk prefetch & navigasi admin.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub;

  // Belum login → ke halaman Masuk, lalu kembali ke halaman tujuan (?next=).
  const isProtected = ["/admin", "/akun"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!user && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = scope === "admin" ? "/masuk/admin" : "/masuk";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Hanya halaman yang membaca sesi di server. Halaman publik (beranda, Activity, Venue, Shop) statis
  // dan status login di Navbar dibaca di browser — tanpa proxy, halaman itu langsung dari cache
  // Vercel tanpa menunggu cek sesi ke Supabase di setiap pindah halaman.
  matcher: [
    "/admin/:path*",
    "/akun/:path*",
    "/masuk/:path*",
    "/daftar",
    "/lupa-password",
    "/reset-password",
    "/auth/:path*",
    "/absensi/:path*",
    // Link email Supabase yang gagal (?error_code=…) bisa kembali ke halaman mana pun.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|images|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
      has: [{ type: "query", key: "error_code" }],
    },
  ],
};
