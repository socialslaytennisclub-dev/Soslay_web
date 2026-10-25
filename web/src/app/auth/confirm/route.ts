import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { AFTER_AUTH, RESET_PASSWORD } from "@/content/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Tujuan link verifikasi email setelah daftar. Mendukung alur PKCE (`?code=`) dan
 * template email `token_hash` — keduanya membuat sesi lalu lanjut ke `next` (default /akun).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Origin dari header Host (nextUrl.origin di dev bisa "0.0.0.0").
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const origin = `${request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
  const rawNext = searchParams.get("next") ?? AFTER_AUTH;
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : AFTER_AUTH;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) return NextResponse.redirect(new URL(next === RESET_PASSWORD ? "/lupa-password?link=expired" : "/masuk?verify=failed", origin));
  return NextResponse.redirect(new URL(next, origin));
}
