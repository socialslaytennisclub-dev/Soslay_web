import "server-only";
import { products } from "@/content/products";
import { orderStage, SHIPPING_LABEL } from "@/lib/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoOrders } from "@/server/shop/demo-store";
import { demoView, ORDER_COLUMNS, toMyOrder, type OrderRow } from "@/server/shop/orders";
import { getDataset, invalidateDataset, type DataOrder, type Dataset } from "./dataset";
import { DAY, monthKey, pctDelta, WIB } from "./time";
import type { OrderDetail, OrderListItem, OrdersQuery, OrdersResult, OrdersTab } from "./types";

/**
 * Data Orders (tabel orders + order_items) lewat getDataset(). Mode live memakai kolom
 * pengiriman/pembayaran asli; mode demo menurunkannya deterministik dari kode order.
 */

const COURIERS = [
  { name: "JNE REG", cost: 18_000, prefix: "JN" },
  { name: "SiCepat REG", cost: 15_000, prefix: "SC" },
  { name: "J&T EZ", cost: 17_000, prefix: "JT" },
];
const PAYMENT_METHODS = ["QRIS", "BCA Virtual Account", "GoPay", "Mandiri Virtual Account"];
const STREETS = ["Jl. Kemang Raya No. 12", "Jl. Senopati No. 48", "Jl. Bangka Raya No. 7", "Jl. Cipete Raya No. 21", "Jl. Batu Belig No. 88", "Jl. Pantai Berawa No. 15", "Jl. Tebet Barat Dalam No. 3"];
const AREAS: Record<string, string> = {
  "Jakarta Selatan": "Mampang Prapatan, Jakarta Selatan 12730",
  "Jakarta Pusat": "Menteng, Jakarta Pusat 10310",
  "Jakarta Barat": "Kebon Jeruk, Jakarta Barat 11530",
  "Jakarta Utara": "Kelapa Gading, Jakarta Utara 14240",
  "Jakarta Timur": "Rawamangun, Jakarta Timur 13220",
  Tangerang: "BSD, Tangerang Selatan 15345",
  Depok: "Beji, Depok 16421",
  Bekasi: "Bekasi Selatan, Bekasi 17141",
  Bandung: "Dago, Bandung 40135",
  Denpasar: "Renon, Denpasar 80226",
  Badung: "Kerobokan, Badung, Bali 80361",
};

const productBySlug = new Map(products.map((p) => [p.slug, p]));
const seedOf = (code: string) => Number(code.replace(/\D/g, "")) || 0;
const monthLabel = (key: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("id-ID", { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));

const stageOf = (o: DataOrder) =>
  orderStage({ status: o.status, payment: o.payment, hasPendingProof: o.shop?.hasPendingProof ?? false, rejections: o.shop?.rejections ?? 0, method: o.shop?.method ?? null });

function inTab(o: DataOrder, tab: OrdersTab) {
  const stage = stageOf(o);
  if (tab === "verify") return stage === "awaiting_verification";
  if (tab === "awaiting") return stage === "awaiting_payment" || stage === "reupload";
  if (tab === "to_process") return stage === "processing";
  if (tab === "shipped") return stage === "shipped" || stage === "ready_pickup";
  if (tab === "completed") return stage === "completed";
  if (tab === "cancelled") return stage === "cancelled";
  return true;
}

/**
 * Semua order: dataset (Supabase / demo) + pesanan checkout mode demo (memori server dev, lihat
 * server/shop/demo-store) supaya alur verifikasi bisa dicoba tanpa Supabase.
 */
async function loadOrders(): Promise<{ d: Dataset; orders: DataOrder[] }> {
  if (isSupabaseConfigured) {
    // Batal otomatis (24 jam tanpa bukti) & J&T selesai 7 hari — sebelum daftar dibaca.
    const { data: changed } = await (await createSupabaseServerClient()).rpc("expire_shop_orders");
    if (Number(changed) > 0) invalidateDataset();
    const d = await getDataset();
    return { d, orders: d.orders };
  }
  const d = await getDataset();
  const buyer = d.members[0]?.id ?? "";
  const local: DataOrder[] = [...demoOrders().values()].map((o) => {
    const v = demoView(o);
    return {
      code: o.code,
      memberId: buyer,
      items: v.items.map((i) => ({ productSlug: products.find((p) => p.name === i.name)?.slug ?? "", name: i.name, variant: i.variant, price: i.price, quantity: i.quantity })),
      total: v.subtotal,
      payment: o.payment as DataOrder["payment"],
      status: o.status as DataOrder["status"],
      placedAt: new Date(o.placedAt),
      detail: { paymentMethod: "Transfer BCA", channel: "website", subtotal: v.subtotal, shippingFee: v.shippingFee, discount: 0, grandTotal: v.total, address: v.recipient.address, courier: v.courier, trackingNumber: v.trackingNumber },
      shop: { method: o.method, hasPendingProof: o.proofs.some((p) => p.status === "pending"), proofAt: o.proofs.find((p) => p.status === "pending")?.uploadedAt ?? null, rejections: o.rejections },
    };
  });
  return { d, orders: [...local.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime()), ...d.orders] };
}

function toItem(d: Dataset, o: DataOrder): OrderListItem {
  const first = o.items[0];
  const extra = o.items.length - 1;
  return {
    code: o.code,
    memberId: o.memberId,
    customer: d.memberById.get(o.memberId)?.fullName ?? "—",
    stage: stageOf(o),
    method: o.shop?.method ?? null,
    proofAt: o.shop?.proofAt ?? null,
    proofLate: Boolean(o.shop?.proofAt && d.now.getTime() - new Date(o.shop.proofAt).getTime() > 12 * 3600_000),
    image: productBySlug.get(first.productSlug)?.image ?? "",
    summary: `${first.name}${first.variant ? ` · ${first.variant}` : ""}${first.quantity > 1 ? ` ×${first.quantity}` : ""}${extra > 0 ? ` +${extra} produk` : ""}${o.shop ? ` · ${SHIPPING_LABEL[o.shop.method].summary}` : ""}`,
    // Order checkout website: total transfer (subtotal + ongkir + kode unik), sama dengan yang dicocokkan admin.
    total: o.shop ? (o.detail?.grandTotal ?? o.total) : o.total,
    payment: o.payment,
    status: o.status,
    placedAt: o.placedAt.toISOString(),
  };
}

export async function listOrders(query: OrdersQuery): Promise<OrdersResult> {
  const { d, orders } = await loadOrders();
  const { memberById, now } = d;
  const tab = query.tab ?? "all";
  const q = query.q?.trim().toLowerCase().replace(/^#/, "");
  const items = orders
    .filter((o) => inTab(o, tab))
    .filter((o) => !query.payment || o.payment === query.payment)
    .filter((o) => !query.month || monthKey(o.placedAt) === query.month)
    .filter((o) => !q || o.code.toLowerCase().includes(q) || (memberById.get(o.memberId)?.fullName.toLowerCase().includes(q) ?? false))
    .slice(0, 80)
    .map((o) => toItem(d, o));

  const tabs: OrdersTab[] = ["all", "verify", "to_process", "shipped", "completed", "awaiting", "cancelled"];
  const counts = Object.fromEntries(tabs.map((t) => [t, orders.filter((o) => inTab(o, t)).length])) as Record<OrdersTab, number>;

  const thisMonth = monthKey(now);
  const prev = new Date(`${thisMonth}-01T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);
  // Pendapatan dibandingkan pada hari yang sama di bulan lalu agar adil saat bulan berjalan.
  const dayOfMonth = Number(new Date(now.getTime() + WIB).toISOString().slice(8, 10));
  const revenue = (key: string, untilDay = 31) =>
    orders
      .filter((o) => o.payment === "paid" && o.status !== "cancelled" && monthKey(o.placedAt) === key && Number(new Date(o.placedAt.getTime() + WIB).toISOString().slice(8, 10)) <= untilDay)
      .reduce((sum, o) => sum + o.total, 0);
  const revenueThisMonth = revenue(thisMonth);
  const revenuePrevSamePeriod = revenue(prevMonth, dayOfMonth);

  return {
    items,
    counts,
    months: [...new Set(orders.map((o) => monthKey(o.placedAt)))].sort().reverse().map((value) => ({ value, label: monthLabel(value, "long") })),
    kpis: {
      toVerify: counts.verify,
      verifyLate: orders.filter((o) => o.shop?.proofAt && now.getTime() - new Date(o.shop.proofAt).getTime() > 12 * 3600_000).length,
      awaiting: counts.awaiting,
      toShipByMethod: (["jnt", "instant", "pickup"] as const)
        .map((m) => `${SHIPPING_LABEL[m].summary.replace(" Reguler", "").replace(" Mabar", "")} ${orders.filter((o) => inTab(o, "to_process") && o.shop?.method === m).length}`)
        .join(" · "),
      toProcess: counts.to_process,
      overdue: orders.filter((o) => inTab(o, "to_process") && now.getTime() - o.placedAt.getTime() > DAY).length,
      inTransit: counts.shipped,
      completedThisMonth: orders.filter((o) => o.status === "completed" && monthKey(o.placedAt) === thisMonth).length,
      revenueThisMonth,
      revenueDelta: pctDelta(revenueThisMonth, revenuePrevSamePeriod),
      monthLabel: monthLabel(thisMonth),
      prevMonthLabel: monthLabel(prevMonth),
    },
  };
}

/** Detail checkout website (bukti, sesi pickup, …) untuk panel admin. */
async function shopDetail(code: string) {
  if (!isSupabaseConfigured) {
    const o = demoOrders().get(code);
    return o ? demoView(o) : null;
  }
  const { data } = await (await createSupabaseServerClient()).from("orders").select(ORDER_COLUMNS).eq("code", code).not("shipping_method", "is", null).maybeSingle();
  return data ? toMyOrder(data as unknown as OrderRow) : null;
}

export async function getOrder(code: string): Promise<OrderDetail | null> {
  const { d, orders } = await loadOrders();
  const o = orders.find((x) => x.code === code);
  if (!o) return null;
  const shop = o.shop ? await shopDetail(code) : null;
  const member = d.memberById.get(o.memberId);
  const previousOrders = d.ordersOf(o.memberId).filter((x) => x.placedAt < o.placedAt).length;
  const items = o.items.map((i) => ({ name: i.name, variant: i.variant, image: productBySlug.get(i.productSlug)?.image ?? "", price: i.price, quantity: i.quantity }));
  const base = { ...toItem(d, o), shop, customerTier: d.stats(o.memberId).tier, customerPhone: member?.phone ?? "", previousOrders, items };
  // Order checkout website: angka & alamat dari pesanan itu sendiri (snapshot saat checkout).
  if (shop) {
    return {
      ...base,
      channel: "Website",
      customerPhone: shop.recipient.phone || base.customerPhone,
      paymentMethod: "Transfer BCA",
      subtotal: shop.subtotal,
      shippingCost: shop.shippingFee,
      pointsDiscount: 0,
      grandTotal: shop.total,
      address: [shop.recipient.address, shop.recipient.city, shop.recipient.postalCode].filter(Boolean).join(", "),
      courier: shop.courier ?? "",
      trackingNumber: shop.trackingNumber,
    };
  }
  if (o.detail) {
    return {
      ...base,
      channel: o.detail.channel === "kuy" ? "Kuy" : o.detail.channel === "reward" ? "Tukar poin" : "Website",
      paymentMethod: o.detail.paymentMethod ?? "—",
      subtotal: o.detail.subtotal,
      shippingCost: o.detail.shippingFee,
      pointsDiscount: o.detail.discount,
      grandTotal: o.detail.grandTotal,
      address: o.detail.address,
      courier: o.detail.courier ?? "",
      trackingNumber: o.detail.trackingNumber,
    };
  }
  const seed = seedOf(o.code);
  const courier = COURIERS[seed % COURIERS.length];
  const subtotal = o.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const pointsDiscount = seed % 4 === 1 ? Math.min(courier.cost, subtotal) : 0;
  return {
    ...base,
    channel: seed % 6 === 2 ? "Kuy" : "Website",
    paymentMethod: PAYMENT_METHODS[seed % PAYMENT_METHODS.length],
    subtotal,
    shippingCost: courier.cost,
    pointsDiscount,
    grandTotal: subtotal + courier.cost - pointsDiscount,
    address: `${STREETS[seed % STREETS.length]}, ${AREAS[member?.city ?? ""] ?? member?.city ?? "Jakarta"}`,
    courier: courier.name,
    trackingNumber: o.status === "shipped" || o.status === "completed" ? `${courier.prefix}${String(seed * 7919).padStart(10, "0")}` : null,
  };
}
