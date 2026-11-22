"use server";

import { revalidatePath } from "next/cache";
import { MAX_REJECTIONS, REJECT_REASONS, trackingUrlError } from "@/lib/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoOrders } from "@/server/shop/demo-store";
import { findMemberByPhone, normalizeIndoPhone, searchMembers, type MemberIdentity } from "../identity";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/**
 * Proses order Shop (ADM-03): verifikasi bukti transfer, lalu per opsi pengiriman —
 * J&T: input resi → dikirim · Instant: kurir + link lacak → dikirim → diterima ·
 * Pickup: siap diambil → sudah diambil. Batal manual wajib alasan.
 */

export type OrderUpdate =
  | { action: "ship"; courier: string; tracking: string; trackingUrl?: string }
  | { action: "ready_pickup" }
  | { action: "complete" }
  | { action: "cancel"; reason: string };

export type PaymentReview = { approve: true; fundsConfirmed: boolean } | { approve: false; reason: string; message: string };

const refreshOrder = (code: string) => {
  refreshPaths("/admin/orders");
  revalidatePath("/akun/order");
  revalidatePath(`/akun/pesanan/${code}`);
};

export async function reviewPayment(code: string, review: PaymentReview): Promise<ActionResult> {
  if (!review.approve) {
    if (!REJECT_REASONS.includes(review.reason as (typeof REJECT_REASONS)[number])) return fail("Pilih alasan penolakan.");
    if (review.reason === "Lainnya" && !review.message.trim()) return fail("Tulis pesan untuk member.");
  } else if (!review.fundsConfirmed) return fail("Centang dulu: dana sudah masuk di mutasi rekening.");

  // Mode demo: pesanan checkout lokal (memori server dev) bisa diverifikasi tanpa Supabase.
  if (!isSupabaseConfigured) return reviewDemo(code, review);

  const auth = await requireEditor("orders");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_payment_proof", review.approve
    ? { p_code: code, p_approve: true, p_funds_confirmed: true }
    : { p_code: code, p_approve: false, p_reason: review.reason, p_message: review.message });
  if (error) return fail(error.message);
  const r = data as { result: "approved" | "rejected" | "cancelled"; points?: number; count?: number };
  const { data: order } = await supabase.from("orders").select("id").eq("code", code).maybeSingle();
  const message =
    r.result === "approved"
      ? `#${code} lunas → Perlu dikirim. Pemasukan tercatat di Keuangan${r.points ? ` · +${r.points} Slay Point` : ""}.`
      : r.result === "cancelled"
        ? `Bukti #${code} ditolak ke-${MAX_REJECTIONS} → pesanan dibatalkan & stok dilepas. Hubungi member via WhatsApp.`
        : `Bukti #${code} ditolak (ke-${r.count} dari maks ${MAX_REJECTIONS}). Member diminta upload ulang, batas +24 jam.`;
  await audit(auth.userId, review.approve ? `menyetujui pembayaran #${code}` : `menolak bukti #${code}: ${review.reason}`, "order", order?.id as string | undefined);
  refreshOrder(code);
  return done(message);
}

function reviewDemo(code: string, review: PaymentReview): ActionResult {
  const o = demoOrders().get(code);
  if (!o) return fail("Mode demo: sambungkan Supabase untuk menyimpan.");
  const proof = o.proofs.find((p) => p.status === "pending");
  if (!proof || o.status !== "pending") return fail("Tidak ada bukti yang menunggu verifikasi.");
  const now = new Date().toISOString();
  if (review.approve) {
    proof.status = "approved";
    proof.reviewedAt = now;
    Object.assign(o, { payment: "paid", status: "processing", paidAt: now, pointsAwarded: Math.floor(o.subtotal / 10000) });
    refreshOrder(code);
    return done(`#${code} lunas → Perlu dikirim (mode demo).`);
  }
  Object.assign(proof, { status: "rejected", rejectReason: review.reason, rejectMessage: review.message.trim() || null, reviewedAt: now });
  o.rejections += 1;
  const cancelled = o.rejections >= MAX_REJECTIONS;
  if (cancelled) Object.assign(o, { status: "cancelled", payment: "failed", cancelledAt: now, cancelReason: `Bukti transfer ditolak ${MAX_REJECTIONS}×` });
  else o.payDeadline = new Date(Date.now() + 86_400_000).toISOString();
  refreshOrder(code);
  return done(cancelled ? `#${code} dibatalkan (tolak ke-${MAX_REJECTIONS}).` : `Bukti #${code} ditolak (ke-${o.rejections}).`);
}

export async function updateOrder(code: string, update: OrderUpdate): Promise<ActionResult> {
  if (update.action === "cancel" && !update.reason.trim()) return fail("Tulis alasan pembatalan.");
  const badUrl = update.action === "ship" ? trackingUrlError(update.trackingUrl) : null;
  if (badUrl) return fail(badUrl);
  if (!isSupabaseConfigured && demoOrders().has(code)) return updateDemo(code, update);

  const auth = await requireEditor("orders");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase.from("orders").select("id, status, payment_status, shipping_method").eq("code", code).maybeSingle();
  if (!order) return fail("Order tidak ditemukan.");
  const now = new Date().toISOString();
  const method = order.shipping_method as string | null;

  let change: Record<string, unknown>;
  let message: string;
  if (update.action === "ship") {
    if (method !== "instant" && !update.tracking.trim()) return fail("Isi nomor resi dulu sebelum menandai dikirim.");
    if (method === "instant" && !update.courier.trim()) return fail("Isi nama kurir (GoSend / GrabExpress).");
    if (order.payment_status !== "paid") return fail("Order belum dibayar.");
    if (!["pending", "processing"].includes(order.status as string)) return fail("Order ini sudah diproses.");
    change = {
      status: "shipped",
      courier: update.courier.trim(),
      tracking_number: update.tracking.trim().toUpperCase() || null,
      tracking_url: update.trackingUrl?.trim() || null,
      shipped_at: now,
    };
    message = `#${code} ditandai dikirim (${update.courier}).`;
  } else if (update.action === "ready_pickup") {
    if (method !== "pickup" || order.status !== "processing") return fail("Hanya pesanan Pickup yang sudah lunas yang bisa ditandai siap diambil.");
    change = { status: "shipped", shipped_at: now };
    message = `#${code} siap diambil di sesi Mabar.`;
  } else if (update.action === "complete") {
    if (order.status !== "shipped") return fail("Hanya order yang sedang dikirim / siap diambil yang bisa diselesaikan.");
    change = { status: "completed", completed_at: now };
    message = method === "pickup" ? `#${code} sudah diambil — selesai.` : `#${code} selesai — diterima customer.`;
  } else {
    if (!["pending", "processing"].includes(order.status as string)) return fail("Order yang sudah dikirim / siap diambil tidak bisa dibatalkan.");
    change = { status: "cancelled", cancelled_at: now, cancel_reason: update.reason.trim(), ...(order.payment_status === "pending" ? { payment_status: "failed" } : {}) };
    message = `#${code} dibatalkan, stok dilepas.${order.payment_status === "paid" ? " Proses refund manual & koreksi Keuangan." : ""}`;
  }

  const { error } = await supabase.from("orders").update(change).eq("id", order.id);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  const verb = { ship: "menandai dikirim", ready_pickup: "menandai siap diambil", complete: "menyelesaikan", cancel: "membatalkan" }[update.action];
  await audit(auth.userId, `${verb} #${code}${update.action === "cancel" ? `: ${update.reason.trim()}` : ""}`, "order", order.id as string);
  refreshOrder(code);
  return done(message);
}

function updateDemo(code: string, update: OrderUpdate): ActionResult {
  const o = demoOrders().get(code)!;
  const now = new Date().toISOString();
  if (update.action === "ship") Object.assign(o, { status: "shipped", courier: update.courier, trackingNumber: update.tracking.trim().toUpperCase() || null, trackingUrl: update.trackingUrl?.trim() || null, shippedAt: now });
  else if (update.action === "ready_pickup") Object.assign(o, { status: "shipped", shippedAt: now });
  else if (update.action === "complete") Object.assign(o, { status: "completed", completedAt: now });
  else Object.assign(o, { status: "cancelled", payment: o.payment === "paid" ? "paid" : "failed", cancelledAt: now, cancelReason: update.reason.trim() });
  refreshOrder(code);
  return done(`#${code} diperbarui (mode demo).`);
}

// ── Input order lama (pembelian di luar checkout website) ─────────────────────

export type OrderMemberOption = Pick<MemberIdentity, "id" | "fullName" | "memberCode" | "phone">;

/** Saran member untuk "Input order lama" (nama, ID Soslay, Kuy ID, nomor HP). */
export async function searchOrderMembers(query: string): Promise<{ ok: true; members: OrderMemberOption[] } | { ok: false; error: string }> {
  const auth = await requireEditor("orders");
  if ("error" in auth) return { ok: false, error: auth.error };
  const members = await searchMembers(query);
  return { ok: true, members: members.map(({ id, fullName, memberCode, phone }) => ({ id, fullName, memberCode, phone })) };
}

export type ManualOrderInput = {
  memberId?: string;
  name?: string;
  phone?: string;
  /** Tanggal bayar (YYYY-MM-DD, WIB) — menentukan masuk Keuangan atau tidak (aturan go-live). */
  paidOn: string;
  paymentMethod: string;
  items: { productName: string; variant: string; quantity: number; unitPrice: number }[];
  shippingFee: number;
  courier: string;
  address: string;
};

/**
 * Catat pembelian merch lama sebagai order Selesai & Lunas (channel "manual"). Tamu yang nomornya milik tepat satu
 * member otomatis ditautkan ke member itu. Pemasukan Keuangan mengikuti trigger orders_finance: hanya bila tanggal
 * bayar ≥ go-live di Pengaturan Keuangan. Stok & Slay Point tidak berubah.
 */
export async function recordManualOrder(input: ManualOrderInput): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return fail("Isi tanggal bayar.");
  const items = input.items.filter((i) => i.productName.trim());
  if (!items.length) return fail("Tambahkan minimal satu produk.");
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0 || !Number.isInteger(i.unitPrice) || i.unitPrice < 0)) return fail("Jumlah & harga tiap produk harus angka.");
  if (!input.memberId && !input.name?.trim()) return fail("Pilih member atau isi nama pembeli.");
  const phone = input.phone?.trim() ? normalizeIndoPhone(input.phone) : null;
  if (input.phone?.trim() && !phone) return fail("Nomor HP tidak valid.");

  const auth = await requireEditor("orders");
  if ("error" in auth) return fail(auth.error);

  let memberId = input.memberId ?? null;
  let linked: string | null = null;
  if (!memberId && phone) {
    const owner = await findMemberByPhone(phone, { unique: true });
    if (owner) {
      memberId = owner.id;
      linked = owner.fullName;
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data: code, error } = await supabase.rpc("admin_record_manual_order", {
    p: {
      member_id: memberId,
      name: input.name?.trim() ?? "",
      phone: phone ? `0${phone}` : "",
      paid_on: input.paidOn,
      payment_method: input.paymentMethod,
      shipping_fee: Math.max(0, Math.round(input.shippingFee || 0)),
      courier: input.courier,
      address: input.address,
      items: items.map((i) => ({ product_name: i.productName.trim(), variant: i.variant.trim(), quantity: i.quantity, unit_price: i.unitPrice })),
    },
  });
  if (error) return fail(`Gagal menyimpan: ${error.message}`);

  const { data: settings } = await supabase.from("finance_settings").select("go_live_date, auto_shop").maybeSingle();
  const goLive = settings?.go_live_date as string | undefined;
  const finance =
    goLive && input.paidOn < goLive
      ? "Tanggal bayar sebelum go-live Keuangan — tidak dicatat di Keuangan."
      : settings?.auto_shop === false
        ? "Pencatatan otomatis Shop di Keuangan sedang nonaktif."
        : "Pemasukan tercatat di Keuangan.";
  await audit(auth.userId, `mencatat order lama #${code}`, "order");
  refreshOrder(code as string);
  return done(`#${code} tersimpan sebagai order selesai${linked ? ` · ditautkan ke member ${linked}` : ""}. ${finance}`);
}
