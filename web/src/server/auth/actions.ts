"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN, AFTER_AUTH, registerPage, RESET_PASSWORD } from "@/content/auth";
import { compact, normalizeKuyId, required, todayIso, validateBirthDate, validateEmail, validateKuyId, validateNewEmail, validatePassword, validatePhone, type FieldErrors } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localPhone } from "@/lib/wa-invite";
import { allowAttempt, clientIp } from "@/server/rate-limit";

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
    email: validateNewEmail(values.email),
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
    email: values.email.toLowerCase(),
    password: values.password,
    options: {
      emailRedirectTo: await signupRedirect(),
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
    // Supabase menolak format yang lolos validasi kita → tunjukkan di field email, bukan error umum.
    if (error.code === "email_address_invalid" || (error.code === "validation_failed" && /email/i.test(error.message))) return { fieldErrors: { email: "Please check your email address" } };
    if (error.code === "weak_password") return { fieldErrors: { password: "Password is too weak — try a longer one" } };
    if (error.code === "over_email_send_rate_limit") return { error: "Too many sign-ups right now. Please try again in a few minutes." };
    // Trigger profil gagal (biasanya Kuy ID baru saja dipakai orang lain di antara cek & daftar).
    const { data: stillFree } = await supabase.rpc("kuy_id_available", { p_kuy_id: kuyId });
    if (stillFree === false) return { fieldErrors: { kuyId: "This Kuy ID is already registered" } };
    return { error: "Couldn't create your account. Please try again in a moment." };
  }
  // Supabase tidak membocorkan email yang sudah terdaftar: user tanpa identities = sudah ada.
  if (data.user && data.user.identities?.length === 0) return { fieldErrors: { email: "This email is already registered — sign in instead" } };
  if (!data.session) return { confirmEmail: values.email.toLowerCase() };
  redirect(AFTER_AUTH);
}

/** Link di email konfirmasi signup — sama dengan signUp. */
async function signupRedirect() {
  return `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(AFTER_AUTH)}`;
}

/** Klien anon tanpa cookie — cek password tanpa membuat / menimpa sesi login di browser. */
function ephemeralClient() {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const isRateLimited = (code: string | undefined) => code === "over_email_send_rate_limit" || code === "over_request_rate_limit";

export type ChangeSignupEmailResult = {
  error?: string;
  fieldErrors?: FieldErrors<"email" | "password">;
  /** Email baru tersimpan; `resendFailed` = email konfirmasi belum terkirim (batas kirim) → tombol kirim ulang. */
  confirmEmail?: string;
  resendFailed?: boolean;
};

/**
 * "Wrong email? Change it" di layar cek email setelah daftar. Aman dari pengambilalihan akun:
 * wajib password yang dipakai saat daftar, dan hanya untuk akun yang BELUM terkonfirmasi.
 * signInWithPassword mengecek password lebih dulu → kode `email_not_confirmed` berarti password
 * benar tapi akun belum aktif. Setelah itu email Auth diganti (service role), link konfirmasi
 * dikirim ulang ke email baru, dan profiles.email disamakan.
 */
export async function changeSignupEmail(currentEmail: string, newEmail: string, password: string): Promise<ChangeSignupEmailResult> {
  const from = String(currentEmail ?? "").trim().toLowerCase();
  const to = String(newEmail ?? "").trim().toLowerCase();
  const fieldErrors = compact<"email" | "password">({
    email: validateNewEmail(to) ?? (to === from ? registerPage.confirm.sameEmail : undefined),
    password: password ? undefined : registerPage.confirm.passwordRequired,
  });
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  if (!isSupabaseConfigured) return { confirmEmail: to };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Changing your email isn't available right now. Please contact the Soslay team." };

  // Cek password dari server = semua percobaan datang dari IP server → batasi per pengunjung (IP, dan
  // IP + akun). Batas per akun saja dibuat longgar: kalau ketat, orang lain bisa mengunci member asli
  // cukup dengan beberapa password salah untuk emailnya.
  const ip = await clientIp();
  if (
    !allowAttempt(`change-email:ip:${ip}`, 10, 15 * 60_000) ||
    !allowAttempt(`change-email:ip-acct:${ip}:${from}`, 5, 15 * 60_000) ||
    !allowAttempt(`change-email:acct:${from}`, 30, 15 * 60_000)
  ) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // 1) Password benar + akun belum dikonfirmasi.
  const anon = ephemeralClient();
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email: from, password });
  if (!signInError) {
    // Password benar tapi akun sudah aktif → tidak boleh lewat jalur ini; jangan tinggalkan sesi.
    if (signedIn.session) await anon.auth.signOut({ scope: "local" });
    return { error: "This account is already confirmed. Sign in and contact the Soslay team to change your email." };
  }
  if (signInError.code === "invalid_credentials") return { fieldErrors: { password: "Incorrect password" } };
  if (isRateLimited(signInError.code)) return { error: "Too many attempts. Please wait a few minutes and try again." };
  if (signInError.code !== "email_not_confirmed") return { error: "Couldn't change your email. Please try again in a moment." };

  // 2) Cari user lewat profilnya (dibuat trigger saat daftar) lalu pastikan memang akun yang sama & belum aktif.
  const { data: profile } = await admin.from("profiles").select("id").eq("email", from).maybeSingle();
  const { data: found } = profile ? await admin.auth.admin.getUserById(profile.id as string) : { data: null };
  const user = found?.user;
  if (!user || user.email?.toLowerCase() !== from || user.email_confirmed_at) {
    return { error: "Couldn't change your email. Please contact the Soslay team." };
  }
  const { data: taken } = await admin.from("profiles").select("id").eq("email", to).neq("id", user.id).maybeSingle();
  if (taken) return { fieldErrors: { email: "This email is already registered — sign in instead" } };

  // 3) Ganti email Auth (tetap belum terkonfirmasi) + samakan profil.
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { email: to });
  if (updateError) {
    if (updateError.code === "email_exists" || /already/i.test(updateError.message)) return { fieldErrors: { email: "This email is already registered — sign in instead" } };
    return { error: "Couldn't change your email. Please try again in a moment." };
  }
  const { error: profileError } = await admin.from("profiles").update({ email: to }).eq("id", user.id);
  if (profileError) {
    // Kembalikan email Auth → login & profil tetap sama (langkah 2 mencari user lewat profiles.email).
    console.warn(`[changeSignupEmail] profiles.email gagal disamakan: ${profileError.message}`);
    const { error: rollbackError } = await admin.auth.admin.updateUserById(user.id, { email: from });
    if (rollbackError) {
      // Login sudah pindah ke email baru, profil belum → jangan suruh ulang dari email lama (pasti gagal).
      console.error(`[changeSignupEmail] email Auth ${user.id} gagal dikembalikan ke ${from}: ${rollbackError.message}`);
      return { error: `Your email was partly updated to ${to}. Please contact the Soslay team to finish it.` };
    }
    return { error: "Couldn't change your email. Please try again in a moment." };
  }

  // 4) Kirim ulang link konfirmasi ke email baru.
  const { error: resendError } = await anon.auth.resend({ type: "signup", email: to, options: { emailRedirectTo: await signupRedirect() } });
  if (resendError) console.warn(`[changeSignupEmail] kirim ulang konfirmasi gagal: ${resendError.message}`);
  return { confirmEmail: to, resendFailed: !!resendError };
}

export type ResendConfirmationResult = { sent?: boolean; error?: string };

/** Kirim ulang link konfirmasi signup. Supabase membatasi ±1 kali per menit per akun. */
export async function resendSignupConfirmation(email: string): Promise<ResendConfirmationResult> {
  const value = String(email ?? "").trim().toLowerCase();
  if (validateEmail(value)) return { error: "Please enter a valid email" };
  if (!isSupabaseConfigured) return { sent: true };
  // Aksi publik → batasi per pengunjung supaya kuota email bersama (daftar, reset, undangan) tidak habis.
  const ip = await clientIp();
  if (!allowAttempt(`resend:ip:${ip}`, 5, 15 * 60_000) || !allowAttempt(`resend:acct:${value}`, 3, 15 * 60_000)) {
    return { error: "Please wait a few minutes before requesting another email." };
  }
  const { error } = await ephemeralClient().auth.resend({ type: "signup", email: value, options: { emailRedirectTo: await signupRedirect() } });
  if (isRateLimited(error?.code) || error?.status === 429) return { error: "Please wait a minute before requesting another email." };
  if (error) return { error: "Couldn't send the email. Please try again in a moment." };
  return { sent: true };
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
