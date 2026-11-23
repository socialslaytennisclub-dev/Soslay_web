"use server";

import { ORDER_NOW_AFTER_CONFIRM, ORDER_NOW_MAX_UNITS, orderNowAccountErrors, orderPayHref, type OrderNowAccount, type OrderNowAccountErrors } from "@/lib/order-now";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localPhone } from "@/lib/wa-invite";
import { rememberAfterConfirm, signupRedirect } from "@/server/auth/redirect";
import { allowAttempt, clientIp } from "@/server/rate-limit";
import { placeOrder } from "./actions";
import { afterOrderPlaced, placeOrderWith, rpcItems, rpcShip } from "./place-order";
import type { CheckoutLine, ShipInput, ShopResult } from "./types";

/**
 * Order Now (/ordernow): pilih produk + daftar akun + buat pesanan dalam satu langkah.
 *  · Sudah login → order biasa atas nama akun itu (halaman pesanan /akun/pesanan/…).
 *  · Belum login → pesanan diuji dulu tanpa menyimpan (check_shop_order: stok, ongkir, sesi pickup), baru akun
 *    dibuat (Supabase signUp) lalu order dibuat server atas nama akun baru (place_shop_order_for) — stok dipegang.
 *    Pembeli ke /ordernow/verifikasi: verifikasi email dulu, link di email masuk ke akun & langsung ke halaman
 *    bayar pesanan itu. Tidak diverifikasi dalam 1 jam → order batal otomatis & stok kembali (expire_shop_orders).
 *  · Email sudah terdaftar & terverifikasi → masuk dengan password yang diisi; cocok → order atas nama akun itu.
 *  · Email terdaftar tapi belum diverifikasi (akun lama) → ditolak: order tidak ditempel ke akun orang lain.
 */

export type OrderNowResult =
  /** `verify` = akun baru: halaman verifikasi email (data ditampilkan di sana, tidak lewat URL). */
  | { ok: true; href: string; verify?: { email: string; code: string } }
  /** `needsVerify` = akun sudah ada tapi belum diverifikasi → form menawarkan kirim ulang link verifikasi. */
  | { ok: false; error: string; fieldErrors?: OrderNowAccountErrors; needsVerify?: boolean };

const VERIFY_PAGE = "/ordernow/verifikasi";
/** Toleransi jam server ↔ Supabase Auth saat membedakan akun baru dari akun lama yang dikembalikan signUp. */
const CLOCK_SKEW_MS = 60_000;

const toResult = (r: ShopResult<{ code: string }>): OrderNowResult => (r.ok ? { ok: true, href: orderPayHref(r.data.code) } : { ok: false, error: r.error });

/** Data akun tamu & batas jumlah (akun belum terverifikasi → stok tidak ditahan berlebihan). */
function guestProblem(account: OrderNowAccount, lines: CheckoutLine[]): OrderNowResult | null {
  const fieldErrors = orderNowAccountErrors(account);
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Lengkapi data akun kamu.", fieldErrors };
  if (lines.reduce((s, l) => s + l.quantity, 0) > ORDER_NOW_MAX_UNITS) {
    return { ok: false, error: `Maksimal ${ORDER_NOW_MAX_UNITS} produk per pesanan untuk akun baru — masuk dulu untuk pesanan lebih banyak.` };
  }
  return null;
}

export async function orderNow(account: OrderNowAccount | null, lines: CheckoutLine[], ship: ShipInput): Promise<OrderNowResult> {
  if (!lines.length) return { ok: false, error: "Pilih produk dulu." };
  // Form tanpa data akun = sudah login → checkout biasa (place_shop_order menolak bila sesinya habis).
  if (!account) return toResult(await placeOrder(lines, ship));
  const problem = guestProblem(account, lines);
  if (problem) return problem;
  const email = account.email.trim().toLowerCase();

  if (!isSupabaseConfigured) {
    const r = await placeOrder(lines, ship);
    return r.ok ? { ok: true, href: VERIFY_PAGE, verify: { email, code: r.data.code } } : { ok: false, error: r.error };
  }
  const supabase = await createSupabaseServerClient("member");
  // Ternyata sudah login (mis. masuk di tab lain) → order atas nama akun itu.
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub) return toResult(await placeOrderWith(supabase, lines, ship));

  const ip = await clientIp();
  if (!allowAttempt(`ordernow:ip:${ip}`, 8, 15 * 60_000) || !allowAttempt(`ordernow:email:${email}`, 4, 15 * 60_000)) {
    return { ok: false, error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Order tanpa akun belum aktif — masuk atau daftar dulu, lalu checkout." };

  // Uji pesanan sebelum akun dibuat: stok habis / kota belum dilayani → tidak ada akun & email yatim.
  const { data: blocker, error: checkError } = await admin.rpc("check_shop_order", { p_items: rpcItems(lines), p_ship: rpcShip(ship) });
  if (checkError) {
    console.error(`[ordernow] check_shop_order: ${checkError.message}`);
    return { ok: false, error: "Pesanan belum bisa dicek. Coba lagi sebentar." };
  }
  if (blocker) return { ok: false, error: blocker as string };

  await rememberAfterConfirm(ORDER_NOW_AFTER_CONFIRM);
  const signUpAt = Date.now();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: account.password,
    options: {
      emailRedirectTo: await signupRedirect(ORDER_NOW_AFTER_CONFIRM),
      data: { signup: "member", full_name: account.fullName.trim(), phone: localPhone(account.phone) },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "Password terlalu lemah.", fieldErrors: { password: "Password terlalu lemah — pakai yang lebih panjang." } };
    if (error.code === "email_address_invalid") return { ok: false, error: "Email belum benar.", fieldErrors: { email: "Cek lagi alamat email kamu." } };
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return { ok: false, error: "Sedang banyak pendaftaran. Coba lagi beberapa menit lagi." };
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      console.error(`[ordernow] signUp: ${error.code ?? ""} ${error.message}`);
      return { ok: false, error: "Akun belum bisa dibuat. Coba lagi sebentar." };
    }
  }

  // Email sudah terdaftar (Supabase: error, atau user tanpa identities) → masuk dengan password yang diisi, lalu order
  // dengan klien yang sama (cookie sesi baru belum terbaca ulang klien lain di request ini).
  if (error || !data.user || data.user.identities?.length === 0) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: account.password });
    if (signInError) {
      const unverified = signInError.code === "email_not_confirmed";
      return {
        ok: false,
        needsVerify: unverified,
        error: unverified ? "Email ini sudah terdaftar tapi belum diverifikasi — klik link di email kamu dulu." : "Email ini sudah terdaftar. Masukkan password akun itu, atau masuk / reset password.",
        fieldErrors: { password: "Password akun ini belum cocok." },
      };
    }
    return toResult(await placeOrderWith(supabase, lines, ship));
  }

  // Verifikasi email dimatikan di Supabase → sudah ada sesi: order biasa dengan klien yang sama.
  if (data.session) return toResult(await placeOrderWith(supabase, lines, ship));

  // Akun lama yang belum diverifikasi (dibuat sebelum signUp ini; signUp mengembalikannya, bukan membuat baru) → jangan
  // tempel order ke akun orang lain hanya karena tahu emailnya.
  const created = Date.parse(data.user.created_at);
  if (!data.user.email_confirmed_at && Number.isFinite(created) && created < signUpAt - CLOCK_SKEW_MS) {
    return { ok: false, needsVerify: true, error: "Email ini sudah didaftarkan tapi belum diverifikasi — klik link verifikasi di email itu, lalu masuk untuk order.", fieldErrors: { email: "Email ini menunggu verifikasi." } };
  }

  // p_replace_pending: kirim ulang (Back, ubah produk / alamat) → pesanan lama yang belum dibayar diganti di transaksi
  // yang sama — tidak ada dua pesanan yang memegang stok, yang dibayar selalu yang terakhir dilihat pembeli.
  const { data: code, error: orderError } = await admin.rpc("place_shop_order_for", { p_member: data.user.id, p_items: rpcItems(lines), p_ship: rpcShip(ship), p_replace_pending: true });
  // Sudah diuji di atas; gagal di sini = stok baru saja diambil pembeli lain. Akun tetap ada → verifikasi, lalu pesan lagi.
  if (orderError) {
    return { ok: false, needsVerify: true, error: `${orderError.message} Akun kamu sudah dibuat — verifikasi email (link sudah dikirim), lalu masuk untuk memesan lagi.` };
  }
  // Link verifikasi di email → langsung ke halaman bayar pesanan ini (cookie tujuan setelah konfirmasi).
  await rememberAfterConfirm(orderPayHref(code as string));
  afterOrderPlaced(code as string);
  return { ok: true, href: VERIFY_PAGE, verify: { email, code: code as string } };
}
