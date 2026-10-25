import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { cookieOptionsFor, SCOPE_HEADER, scopeForPath } from "@/lib/supabase/scope";

/**
 * Refresh sesi Supabase di setiap request + cek optimistis untuk /admin dan area member /akun.
 * Otorisasi sebenarnya (role & izin modul) tetap di server: layout admin + RLS.
 * Tanpa env Supabase, proxy tidak melakukan apa-apa (mode demo).
 *
 * Sesi admin & member terpisah: /admin & /masuk/admin memakai cookie admin, sisanya cookie
 * member (lihat lib/supabase/scope). Scope diteruskan ke server lewat header SCOPE_HEADER.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  // Lewati aset statis & gambar.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
