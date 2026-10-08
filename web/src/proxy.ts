import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refresh sesi Supabase di setiap request + cek optimistis untuk /admin.
 * Otorisasi sebenarnya (role & izin modul) tetap di server: layout admin + RLS.
 * Tanpa env Supabase, proxy tidak melakukan apa-apa (mode demo).
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  // /akun (member area) masih data demo → belum dikunci; dikunci saat sudah membaca Supabase.
  if (!user && pathname.startsWith("/admin")) {
    const login = request.nextUrl.clone();
    login.pathname = "/masuk";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Lewati aset statis & gambar.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
