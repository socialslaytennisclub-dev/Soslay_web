"use server";

import { revalidatePath } from "next/cache";
import { estimateRouteKm, instantQuote, jntFee, PROOF_MAX_BYTES, PROOF_TYPES, SHIPPING_LABEL, variantLabel } from "@/lib/checkout";
import { provinceOf } from "@/content/wilayah";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShopCatalog } from "@/server/public/products";
import { uploadPrivateFile } from "@/server/storage";
import { demoOrders, demoProofFiles, nextDemoCode } from "./demo-store";
import { getCheckoutContext, PROOF_BUCKET } from "./orders";
import { getShopBank } from "./settings";
import type { CheckoutLine, ShipInput, ShopResult } from "./types";

/** Aksi member: buat pesanan, kirim bukti transfer, konfirmasi diterima, ganti sesi pickup. */

const refresh = (code?: string) => {
  revalidatePath("/akun/order");
  if (code) revalidatePath(`/akun/pesanan/${code}`);
};

export async function placeOrder(lines: CheckoutLine[], ship: ShipInput): Promise<ShopResult<{ code: string }>> {
  if (!lines.length) return { ok: false, error: "Belum ada produk dipilih." };
  if (!isSupabaseConfigured) return placeDemoOrder(lines, ship);

  const supabase = await createSupabaseServerClient("member");
  const { data, error } = await supabase.rpc("place_shop_order", {
    p_items: lines.map((l) => ({ slug: l.slug, options: l.options, quantity: l.quantity })),
    p_ship: {
      method: ship.method,
      name: ship.name,
      phone: ship.phone,
      address: ship.address ?? null,
      city: ship.city ?? null,
      postal_code: ship.postalCode ?? null,
      lat: ship.method === "instant" ? ship.lat : null,
      lng: ship.method === "instant" ? ship.lng : null,
      session_id: ship.method === "pickup" ? ship.sessionId : null,
    },
  });
  if (error) return { ok: false, error: error.code === "42501" ? "Sesi kamu berakhir — masuk lagi untuk checkout." : error.message };
  refresh();
  return { ok: true, data: { code: data as string } };
}

async function placeDemoOrder(lines: CheckoutLine[], ship: ShipInput): Promise<ShopResult<{ code: string }>> {
  const [{ products }, ctx, bank] = await Promise.all([getShopCatalog(), getCheckoutContext(), getShopBank()]);
  if (!ship.name.trim() || !ship.phone.trim()) return { ok: false, error: "Isi nama & nomor HP penerima." };
  const items = [];
  let weight = 0;
  for (const line of lines) {
    const p = products.find((x) => x.slug === line.slug);
    if (!p) return { ok: false, error: `Produk "${line.slug}" tidak tersedia lagi.` };
    if (p.stock < line.quantity) return { ok: false, error: `Stok ${p.name} tinggal ${p.stock}.` };
    items.push({ name: p.name, variant: variantLabel(p.slug, line.options), image: p.image, price: p.price, quantity: line.quantity });
    weight += (ctx.weights[p.slug] ?? 300) * line.quantity;
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  let fee = 0;
  let km: number | null = null;
  const rate = ctx.rates.find((r) => r.city === ship.city);
  if (ship.method !== "pickup" && (!ship.address?.trim() || !ship.city || !ship.postalCode?.trim())) return { ok: false, error: "Lengkapi alamat, kota & kode pos." };
  if (ship.method === "jnt") {
    if (!rate) return { ok: false, error: "Pengiriman ke kota ini belum tersedia, hubungi admin." };
    fee = jntFee(rate.perKg, weight);
  } else if (ship.method === "instant") {
    if (provinceOf(ship.city ?? "") !== "DKI Jakarta") return { ok: false, error: "Instant hanya untuk alamat di DKI Jakarta." };
    if (ship.lat === undefined || ship.lng === undefined) return { ok: false, error: "Atur titik lokasi di peta dulu." };
    km = estimateRouteKm(ship.lat, ship.lng, ctx.instant);
    const q = instantQuote(km, ctx.instant);
    if (q.tooFar) return { ok: false, error: `Titik lokasi lebih dari ${ctx.instant.maxKm} km — Instant tidak tersedia.` };
    fee = q.fee;
  }
  const pickup = ship.method === "pickup" ? ctx.pickupSessions.find((s) => s.id === ship.sessionId) : undefined;
  if (ship.method === "pickup" && !pickup) return { ok: false, error: "Sesi Mabar untuk pickup tidak tersedia — pilih sesi lain." };

  const used = new Set([...demoOrders().values()].filter((o) => o.status === "pending").map((o) => o.uniqueCode));
  let uniqueCode = 0;
  while (!uniqueCode || used.has(uniqueCode)) uniqueCode = 1 + Math.floor(Math.random() * 999);
  const code = nextDemoCode();
  const now = new Date();
  demoOrders().set(code, {
    code,
    memberId: "demo",
    status: "pending",
    payment: "pending",
    placedAt: now.toISOString(),
    method: ship.method,
    items,
    subtotal,
    shippingFee: fee,
    uniqueCode,
    total: subtotal + fee + uniqueCode,
    payDeadline: new Date(now.getTime() + 86_400_000).toISOString(),
    recipient: ship.method === "pickup" ? { name: ship.name, phone: ship.phone, address: "Pickup di Mabar Session", city: "", postalCode: "" } : { name: ship.name, phone: ship.phone, address: ship.address ?? "", city: ship.city ?? "", postalCode: ship.postalCode ?? "" },
    distanceKm: km,
    pin: ship.method === "instant" && ship.lat !== undefined && ship.lng !== undefined ? { lat: ship.lat, lng: ship.lng } : null,
    bank,
    weightGrams: weight,
    courier: SHIPPING_LABEL[ship.method].summary,
    trackingNumber: null,
    trackingUrl: null,
    pickup: pickup ? { id: pickup.id, title: pickup.title, startsAt: pickup.startsAt, endsAt: pickup.endsAt, venue: pickup.venue, deadline: pickup.deadline, late: false } : null,
    proofs: [],
    rejections: 0,
    pointsAwarded: 0,
    paidAt: null,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
  });
  return { ok: true, data: { code } };
}

/** Bukti transfer: file (JPG/PNG/PDF ≤ 5 MB) + nama pengirim, bank, jumlah, tanggal, catatan. */
export async function submitProof(code: string, form: FormData): Promise<ShopResult> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file bukti transfer dulu." };
  if (!PROOF_TYPES[file.type]) return { ok: false, error: "Format harus JPG, PNG, atau PDF." };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "Ukuran file maksimal 5 MB." };
  const fields = {
    sender_name: String(form.get("senderName") ?? "").trim(),
    sender_bank: String(form.get("senderBank") ?? "").trim(),
    amount: Number(String(form.get("amount") ?? "").replace(/\D/g, "")),
    transfer_date: String(form.get("transferDate") ?? ""),
    note: String(form.get("note") ?? "").trim(),
  };
  if (!fields.sender_name || !fields.sender_bank || !fields.amount || !/^\d{4}-\d{2}-\d{2}$/.test(fields.transfer_date)) {
    return { ok: false, error: "Lengkapi nama pengirim, bank, jumlah & tanggal transfer." };
  }

  if (!isSupabaseConfigured) {
    const o = demoOrders().get(code);
    if (!o || o.status !== "pending" || o.payment !== "pending") return { ok: false, error: "Pesanan ini tidak menunggu pembayaran." };
    const id = crypto.randomUUID();
    demoProofFiles().set(id, { mime: file.type, data: Buffer.from(await file.arrayBuffer()) });
    for (const p of o.proofs) if (p.status === "pending") p.status = "replaced";
    o.proofs.unshift({
      id,
      status: "pending",
      fileName: file.name,
      mime: file.type,
      size: file.size,
      senderName: fields.sender_name,
      senderBank: fields.sender_bank,
      amount: fields.amount,
      transferDate: fields.transfer_date,
      note: fields.note || null,
      uploadedAt: new Date().toISOString(),
      rejectReason: null,
      rejectMessage: null,
      reviewedAt: null,
    });
    refresh(code);
    return { ok: true };
  }

  const supabase = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi kamu berakhir — masuk lagi untuk upload bukti." };
  // Cek pesanan milik sendiri sebelum menyimpan file (RLS select).
  const { data: own } = await supabase.from("orders").select("code").eq("code", code).eq("member_id", user.id).maybeSingle();
  if (!own) return { ok: false, error: "Pesanan tidak ditemukan." };
  const upload = await uploadPrivateFile({ bucket: PROOF_BUCKET, file, folder: user.id, maxBytes: PROOF_MAX_BYTES, types: PROOF_TYPES });
  if (!upload.ok) return { ok: false, error: upload.error };
  const { error } = await supabase.rpc("submit_payment_proof", {
    p_code: code,
    p_proof: { ...fields, path: upload.path, name: file.name, mime: file.type, size: file.size },
  });
  if (error) return { ok: false, error: error.message };
  refresh(code);
  return { ok: true };
}

export async function confirmReceived(code: string): Promise<ShopResult> {
  if (!isSupabaseConfigured) {
    const o = demoOrders().get(code);
    if (!o || o.status !== "shipped" || o.method === "pickup") return { ok: false, error: "Pesanan tidak bisa dikonfirmasi." };
    Object.assign(o, { status: "completed", completedAt: new Date().toISOString() });
  } else {
    const supabase = await createSupabaseServerClient("member");
    const { error } = await supabase.rpc("confirm_order_received", { p_code: code });
    if (error) return { ok: false, error: error.message };
  }
  refresh(code);
  return { ok: true };
}

export async function changePickupSession(code: string, sessionId: string): Promise<ShopResult> {
  if (!isSupabaseConfigured) {
    const o = demoOrders().get(code);
    const s = (await getCheckoutContext()).pickupSessions.find((x) => x.id === sessionId);
    if (!o || !s) return { ok: false, error: "Sesi Mabar ini tidak bisa dipilih." };
    o.pickup = { id: s.id, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, venue: s.venue, deadline: s.deadline, late: false };
  } else {
    const supabase = await createSupabaseServerClient("member");
    const { error } = await supabase.rpc("change_pickup_session", { p_code: code, p_session: sessionId });
    if (error) return { ok: false, error: error.message };
  }
  refresh(code);
  return { ok: true };
}
