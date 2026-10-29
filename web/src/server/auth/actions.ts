"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN, AFTER_AUTH, RESET_PASSWORD } from "@/content/auth";
import { compact, normalizeKuyId, required, todayIso, validateBirthDate, validateEmail, validateKuyId, validatePassword, validatePhone, type FieldErrors } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localPhone } from "@/lib/wa-invite";

/** Hanya path internal ("/admin", "/akun?x=1") — cegah open redirect lewat ?next=. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : AFTER_AUTH;
}

export type SignInResult = { error: string; code: "invalid_credentials" | "failed" } | undefined;

export async function signIn(email: string, password: string, next?: string): Promise<SignInResult> {
  if (!isSupabaseConfigured) redirect(safeNext(next));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return error.code === "invalid_credentials"
      ? { error: "Incorrect email or password.", code: "invalid_credentials" }
      : { error: "Couldn't sign in. Please try again in a moment.", code: "failed" };
  }
  // Staf undangan jadi aktif di login pertama + catat "terakhir aktif" (diabaikan untuk non-staf).
  await supabase.rpc("touch_staff_login");
  redirect(safeNext(next));
}

export type SignUpInput = {
  fullName: string;
  displayName: string;
  kuyId: string;
  birthDate: string;
  phone: string;
  email: string;
  password: string;
};
type SignUpField = keyof SignUpInput;
/** `confirm` → akun dibuat, tunggu klik link verifikasi di email. */
export type SignUpResult = { error?: string; fieldErrors?: FieldErrors<SignUpField>; confirmEmail?: string } | undefined;

/**
 * Daftar member → Supabase Auth. Data profil ikut sebagai metadata; trigger DB
 * `handle_member_signup` membuat baris profiles. Bila "Confirm email" aktif di Supabase,
 * belum ada sesi → form menampilkan "cek email"; selain itu langsung masuk ke /akun.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  if (!isSupabaseConfigured) redirect(AFTER_AUTH);

  const values = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, k === "password" ? String(v ?? "") : String(v ?? "").trim()])) as SignUpInput;
  const fieldErrors = compact<SignUpField>({
    fullName: required(values.fullName, "Full name"),
    kuyId: validateKuyId(values.kuyId),
    phone: validatePhone(values.phone),
    email: validateEmail(values.email),
    password: validatePassword(values.password, true),
    // Server berjalan di UTC, member di WIB → toleransi satu hari untuk "hari ini".
    birthDate: validateBirthDate(values.birthDate, todayIso(new Date(Date.now() + 86_400_000))),
  });
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  const kuyId = normalizeKuyId(values.kuyId);

  const supabase = await createSupabaseServerClient();
  const { data: kuyFree } = await supabase.rpc("kuy_id_available", { p_kuy_id: kuyId });
  if (kuyFree === false) return { fieldErrors: { kuyId: "This Kuy ID is already registered" } };

  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(AFTER_AUTH)}`,
      data: {
        signup: "member",
        full_name: values.fullName,
        display_name: values.displayName,
        kuy_id: kuyId,
        // Format pembanding yang sama dengan form lain → klaim ghost member lewat nomor HP cocok.
        phone: localPhone(values.phone),
        birth_date: values.birthDate,
      },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") return { fieldErrors: { email: "This email is already registered — sign in instead" } };
    if (error.code === "weak_password") return { fieldErrors: { password: "Password is too weak — try a longer one" } };
    if (error.code === "over_email_send_rate_limit") return { error: "Too many sign-ups right now. Please try again in a few minutes." };
    // Trigger profil gagal (biasanya Kuy ID baru saja dipakai orang lain di antara cek & daftar).
    const { data: stillFree } = await supabase.rpc("kuy_id_available", { p_kuy_id: kuyId });
    if (stillFree === false) return { fieldErrors: { kuyId: "This Kuy ID is already registered" } };
    return { error: "Couldn't create your account. Please try again in a moment." };
  }
  // Supabase tidak membocorkan email yang sudah terdaftar: user tanpa identities = sudah ada.
  if (data.user && data.user.identities?.length === 0) return { fieldErrors: { email: "This email is already registered — sign in instead" } };
  if (!data.session) return { confirmEmail: values.email };
  redirect(AFTER_AUTH);
}

export type ResetRequestResult = { error?: string; fieldError?: string; sent?: string };

/**
 * Lupa password → Supabase kirim link reset. Link kembali lewat /auth/confirm (buat sesi) lalu
 * ke halaman setel password baru. Hasil selalu "terkirim" supaya email terdaftar tidak bocor.
 */
export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  const value = String(email ?? "").trim();
  const fieldError = validateEmail(value);
  if (fieldError) return { fieldError };
  if (!isSupabaseConfigured) return { sent: value };

  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.auth.resetPasswordForEmail(value, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(RESET_PASSWORD)}`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return { error: "Too many requests right now. Please wait a few minutes and try again." };
  return { sent: value };
}

export type UpdatePasswordResult = { error?: string; fieldError?: string } | undefined;

/** Setel password baru untuk sesi dari link reset, lalu lanjut ke /akun. */
export async function updatePassword(password: string): Promise<UpdatePasswordResult> {
  const fieldError = validatePassword(password, true);
  if (fieldError) return { fieldError };
  if (!isSupabaseConfigured) redirect(AFTER_AUTH);

  const supabase = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error?.code === "same_password") return { fieldError: "Choose a different password from your current one" };
  if (error?.code === "weak_password") return { fieldError: "Password is too weak — try a longer one" };
  if (error) return { error: "Couldn't save your password. Please try again in a moment." };
  redirect(AFTER_AUTH);
}

/** Origin absolut untuk link di email: Origin dari browser, cadangan Host (+ proto dari proxy Vercel). */
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "");
}

/**
 * Keluar → halaman Masuk member, atau login admin bila form mengirim `to=admin`. Hanya sesi
 * area itu yang diakhiri (scope "local") — login di area lain (admin ↔ member) tetap jalan.
 */
export async function signOut(formData?: FormData) {
  const admin = formData?.get("to") === "admin";
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient(admin ? "admin" : "member");
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect(admin ? ADMIN_LOGIN : "/masuk");
}
