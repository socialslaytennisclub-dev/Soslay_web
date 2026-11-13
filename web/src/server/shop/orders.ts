import "server-only";
import { cache } from "react";
import { DEFAULT_INSTANT, orderStage, variantLabel, pickupDeadline, type ShippingMethod, type ShippingRate } from "@/lib/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "@/server/member/user";
import { getShopCatalog } from "@/server/public/products";
import { getWebsiteSessions } from "@/server/public/sessions";
import { demoOrders, DEMO_RATES } from "./demo-store";
import { getShopBank, toInstant } from "./settings";
import type { CheckoutContext, MyOrder, MyOrderListItem, PickupSession, ProofView, Recipient } from "./types";

/**
 * Data checkout & pesanan member. Dengan Supabase: tabel orders / order_payment_proofs (RLS: milik
 * sendiri) + RPC expire_shop_orders sebelum dibaca. Tanpa Supabase (mode demo): pesanan disimpan di
 * memori server dev (demo-store) supaya alur bisa dicoba dari awal sampai akhir.
 */

export const PROOF_BUCKET = "payment-proofs";
const PICKUP_WINDOW_DAYS = 14;

/** Default berat bila produk belum punya weight_grams (mode demo / katalog statis). */
const DEFAULT_WEIGHT: Record<string, number> = { apparel: 300, socks: 100, pin: 50, figure: 200, racket: 1000, accessory: 200 };

const emptyRecipient: Recipient = { name: "", phone: "", address: "", city: "", postalCode: "" };

type ProfileShipRow = {
  full_name: string;
  phone: string | null;
  city: string | null;
  ship_recipient: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_postal_code: string | null;
  ship_lat: number | null;
  ship_lng: number | null;
};

type SessionRow = { id: string; title: string; starts_at: string; ends_at: string; venues: { name: string } | null };

async function demoPickupSessions(): Promise<PickupSession[]> {
  const now = Date.now();
  const sessions = await getWebsiteSessions();
  return sessions
    .filter((s) => s.type === "weekly-mabar")
    .map((s, i) => {
      const offset = s.venue.city === "Bali" ? "+08:00" : "+07:00";
      const startsAt = new Date(`${s.date}T${s.start}:00${offset}`).toISOString();
      return { id: s.slug, title: "Mabar Session", startsAt, endsAt: new Date(`${s.date}T${s.end}:00${offset}`).toISOString(), venue: s.venue.name, registered: i === 0, deadline: pickupDeadline(startsAt) };
    })
    .filter((s) => new Date(s.startsAt).getTime() < now + PICKUP_WINDOW_DAYS * 86_400_000 && new Date(s.deadline).getTime() > now)
    .sort((a, b) => Number(b.registered) - Number(a.registered) || a.startsAt.localeCompare(b.startsAt));
}

export const getCheckoutContext = cache(async (): Promise<CheckoutContext> => {
  const catalog = await getShopCatalog();
  const fallbackWeights = Object.fromEntries(catalog.products.map((p) => [p.slug, DEFAULT_WEIGHT[p.category] ?? 300]));

  if (!isSupabaseConfigured) {
    const last = [...demoOrders().values()].filter((o) => o.method !== "pickup").at(-1);
    return {
      demo: true,
      loggedIn: true,
      recipient: last?.recipient ?? { name: "Arya Putra Dewangga", phone: "0812-3456-7890", address: "Jl. Kemang Raya No. 12, Bangka, Mampang Prapatan", city: "Jakarta Selatan", postalCode: "12730" },
      pin: last?.pin ?? null,
      bankShort: (await getShopBank()).short,
      rates: DEMO_RATES,
      instant: DEFAULT_INSTANT,
      pickupSessions: await demoPickupSessions(),
      weights: fallbackWeights,
    };
  }

  const { supabase, user } = await getMemberSession();
  const now = new Date();
  const [{ data: rates }, { data: instant }, { data: sessions }, { data: products }, profile, lastOrder, booked, bank] = await Promise.all([
    supabase.from("shipping_rates").select("city, province, per_kg, eta_days").eq("is_active", true).order("city"),
    supabase.from("shipping_instant_settings").select("*").maybeSingle(),
    supabase
      .from("sessions")
      .select("id, title, starts_at, ends_at, venues(name)")
      .eq("type_slug", "weekly-mabar")
      .eq("status", "published")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + PICKUP_WINDOW_DAYS * 86_400_000).toISOString())
      .order("starts_at"),
    supabase.from("products").select("slug, weight_grams").eq("status", "active"),
    user
      ? supabase.from("profiles").select("full_name, phone, city, ship_recipient, ship_phone, ship_address, ship_city, ship_postal_code, ship_lat, ship_lng").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("orders").select("recipient_name, recipient_phone, shipping_address, shipping_city, postal_code").eq("member_id", user.id).in("shipping_method", ["jnt", "instant"]).order("placed_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? supabase.from("bookings").select("session_id").eq("member_id", user.id).neq("status", "cancelled") : Promise.resolve({ data: [] }),
    getShopBank(),
  ]);

  const registered = new Set((booked.data ?? []).map((b) => b.session_id as string));
  const p = profile.data as ProfileShipRow | null;
  const o = lastOrder.data as { recipient_name: string; recipient_phone: string; shipping_address: string; shipping_city: string | null; postal_code: string | null } | null;
  const settings = toInstant(instant);
  // Alamat di profil member (diisi di tab Profile) diutamakan; kalau belum ada → pesanan kirim terakhir.
  const saved = p?.ship_address ? p : null;

  return {
    demo: false,
    loggedIn: Boolean(user),
    recipient: saved
      ? { name: saved.ship_recipient || saved.full_name, phone: saved.ship_phone || (saved.phone ? `0${saved.phone}` : ""), address: saved.ship_address ?? "", city: saved.ship_city ?? "", postalCode: saved.ship_postal_code ?? "" }
      : o
        ? { name: o.recipient_name, phone: o.recipient_phone, address: o.shipping_address, city: o.shipping_city ?? "", postalCode: o.postal_code ?? "" }
        : { ...emptyRecipient, name: p?.full_name ?? "", phone: p?.phone ? `0${p.phone}` : "", city: p?.city ?? "" },
    bankShort: bank.short,
    pin: saved && saved.ship_lat !== null && saved.ship_lng !== null ? { lat: saved.ship_lat, lng: saved.ship_lng } : null,
    rates: (rates ?? []).map((r): ShippingRate => ({ city: r.city, province: r.province, perKg: r.per_kg, eta: r.eta_days })),
    instant: settings,
    pickupSessions: ((sessions ?? []) as unknown as SessionRow[])
      .map((s) => ({ id: s.id, title: s.title, startsAt: s.starts_at, endsAt: s.ends_at, venue: s.venues?.name ?? "", registered: registered.has(s.id), deadline: pickupDeadline(s.starts_at) }))
      .filter((s) => new Date(s.deadline) > now)
      .sort((a, b) => Number(b.registered) - Number(a.registered) || a.startsAt.localeCompare(b.startsAt)),
    weights: { ...fallbackWeights, ...Object.fromEntries((products ?? []).map((r) => [r.slug, r.weight_grams])) },
  };
});

// ── Pesanan member ─────────────────────────────────────────────────────────

type ProofRow = {
  id: string;
  status: ProofView["status"];
  file_name: string;
  mime: string;
  file_size: number;
  sender_name: string;
  sender_bank: string;
  amount: number;
  transfer_date: string;
  note: string | null;
  uploaded_at: string;
  reject_reason: string | null;
  reject_message: string | null;
  reviewed_at: string | null;
};

export const toProof = (p: ProofRow): ProofView => ({
  id: p.id,
  status: p.status,
  fileName: p.file_name,
  mime: p.mime,
  size: p.file_size,
  senderName: p.sender_name,
  senderBank: p.sender_bank,
  amount: p.amount,
  transferDate: p.transfer_date,
  note: p.note,
  uploadedAt: p.uploaded_at,
  rejectReason: p.reject_reason,
  rejectMessage: p.reject_message,
  reviewedAt: p.reviewed_at,
});

export const PROOF_COLUMNS = "id, status, file_name, mime, file_size, sender_name, sender_bank, amount, transfer_date, note, uploaded_at, reject_reason, reject_message, reviewed_at";

export const ORDER_COLUMNS = `code, status, payment_status, placed_at, subtotal, shipping_fee, unique_code, total, pay_deadline, recipient_name, recipient_phone,
  shipping_address, shipping_city, postal_code, shipping_method, shipping_lat, shipping_lng, distance_km, weight_grams, courier, tracking_number, tracking_url, proof_rejections,
  points_awarded, paid_at, shipped_at, completed_at, cancelled_at, cancel_reason,
  pickup:sessions!orders_pickup_session_id_fkey(id, title, starts_at, ends_at, venues(name)),
  order_items(product_name, options, unit_price, quantity, product_variants(products(slug))),
  order_payment_proofs(${PROOF_COLUMNS})`;

export type OrderRow = {
  code: string;
  status: string;
  payment_status: string;
  placed_at: string;
  subtotal: number;
  shipping_fee: number;
  unique_code: number;
  total: number;
  pay_deadline: string | null;
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  shipping_city: string | null;
  postal_code: string | null;
  shipping_method: ShippingMethod | null;
  shipping_lat: number | null;
  shipping_lng: number | null;
  distance_km: number | null;
  weight_grams: number | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  proof_rejections: number;
  points_awarded: number;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  pickup: SessionRow | null;
  order_items: { product_name: string; options: Record<string, string> | null; unit_price: number; quantity: number; product_variants: { products: { slug: string } | null } | null }[];
  order_payment_proofs: ProofRow[];
};

/** Baris database → tampilan pesanan (dipakai juga oleh admin). */
export async function toMyOrder(o: OrderRow): Promise<MyOrder> {
  const { products } = await getShopCatalog();
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const byName = new Map(products.map((p) => [p.name, p]));
  const proofs = [...o.order_payment_proofs].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).map(toProof);
  const method = o.shipping_method ?? "jnt";
  return {
    code: o.code,
    placedAt: o.placed_at,
    stage: orderStage({ status: o.status, payment: o.payment_status, hasPendingProof: proofs.some((p) => p.status === "pending"), rejections: o.proof_rejections, method }),
    method,
    items: o.order_items.map((i) => {
      const slug = i.product_variants?.products?.slug ?? byName.get(i.product_name)?.slug ?? "";
      return { name: i.product_name, variant: variantLabel(slug, i.options ?? {}), image: bySlug.get(slug)?.image ?? byName.get(i.product_name)?.image ?? "", price: i.unit_price, quantity: i.quantity };
    }),
    subtotal: o.subtotal,
    shippingFee: o.shipping_fee,
    uniqueCode: o.unique_code,
    total: o.total,
    payDeadline: o.pay_deadline,
    recipient: { name: o.recipient_name, phone: o.recipient_phone, address: o.shipping_address, city: o.shipping_city ?? "", postalCode: o.postal_code ?? "" },
    distanceKm: o.distance_km === null ? null : Number(o.distance_km),
    pin: o.shipping_lat !== null && o.shipping_lng !== null ? { lat: o.shipping_lat, lng: o.shipping_lng } : null,
    weightGrams: o.weight_grams,
    courier: o.courier,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    pickup: o.pickup ? { id: o.pickup.id, title: o.pickup.title, startsAt: o.pickup.starts_at, endsAt: o.pickup.ends_at, venue: o.pickup.venues?.name ?? "", deadline: pickupDeadline(o.pickup.starts_at), late: new Date(pickupDeadline(o.pickup.starts_at)).getTime() < Date.now() } : null,
    proofs,
    rejections: o.proof_rejections,
    pointsAwarded: o.points_awarded,
    paidAt: o.paid_at,
    shippedAt: o.shipped_at,
    completedAt: o.completed_at,
    cancelledAt: o.cancelled_at,
    cancelReason: o.cancel_reason,
  };
}

export const getMyOrder = cache(async (code: string): Promise<MyOrder | null> => {
  if (!isSupabaseConfigured) {
    const o = demoOrders().get(code);
    return o ? demoView(o) : null;
  }
  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  await supabase.rpc("expire_shop_orders");
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("code", code).eq("member_id", user.id).maybeSingle();
  return data ? toMyOrder(data as unknown as OrderRow) : null;
});

export const listMyOrders = cache(async (): Promise<MyOrderListItem[]> => {
  let orders: MyOrder[];
  if (!isSupabaseConfigured) {
    orders = [...demoOrders().values()].map(demoView);
  } else {
    const { supabase, user } = await getMemberSession();
    if (!user) return [];
    await supabase.rpc("expire_shop_orders");
    const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("member_id", user.id).not("shipping_method", "is", null).order("placed_at", { ascending: false }).limit(30);
    orders = await Promise.all(((data ?? []) as unknown as OrderRow[]).map(toMyOrder));
  }
  return orders
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
    .map((o) => ({
      code: o.code,
      placedAt: o.placedAt,
      stage: o.stage,
      method: o.method,
      total: o.total,
      payDeadline: o.payDeadline,
      image: o.items[0]?.image ?? "",
      summary: `${o.items[0]?.name ?? ""}${o.items.length > 1 ? ` +${o.items.length - 1} produk` : ""}`,
    }));
});

/** Pesanan demo → tampilan (stage dihitung ulang; batas bayar lewat → batal). */
export function demoView(o: import("./demo-store").DemoShopOrder): MyOrder {
  const now = Date.now();
  if (o.status === "pending" && o.payment === "pending" && o.payDeadline && new Date(o.payDeadline).getTime() < now && !o.proofs.some((p) => p.status === "pending")) {
    Object.assign(o, { status: "cancelled", payment: "failed", cancelledAt: new Date().toISOString(), cancelReason: "Tidak ada bukti transfer sampai batas waktu" });
  }
  const { status, payment, memberId: _member, ...rest } = o;
  void _member;
  if (rest.pickup) rest.pickup = { ...rest.pickup, late: new Date(rest.pickup.deadline).getTime() < now };
  return { ...rest, stage: orderStage({ status, payment, hasPendingProof: o.proofs.some((p) => p.status === "pending"), rejections: o.rejections, method: o.method }) };
}
