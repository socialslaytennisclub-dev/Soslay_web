import "server-only";
import { products } from "@/content/products";
import { getDataset, type DataOrder, type Dataset } from "./dataset";
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

function inTab(o: DataOrder, tab: OrdersTab) {
  if (tab === "to_process") return o.status === "processing" || (o.status === "pending" && o.payment === "paid");
  if (tab === "shipped") return o.status === "shipped";
  if (tab === "completed") return o.status === "completed";
  if (tab === "cancelled") return o.status === "cancelled";
  return true;
}

function toItem(d: Dataset, o: DataOrder): OrderListItem {
  const first = o.items[0];
  const extra = o.items.length - 1;
  return {
    code: o.code,
    memberId: o.memberId,
    customer: d.memberById.get(o.memberId)?.fullName ?? "—",
    image: productBySlug.get(first.productSlug)?.image ?? "",
    summary: `${first.name}${first.variant ? ` · ${first.variant}` : ""}${first.quantity > 1 ? ` ×${first.quantity}` : ""}${extra > 0 ? ` +${extra} produk` : ""}`,
    total: o.total,
    payment: o.payment,
    status: o.status,
    placedAt: o.placedAt.toISOString(),
  };
}

export async function listOrders(query: OrdersQuery): Promise<OrdersResult> {
  const d = await getDataset();
  const { orders, memberById, now } = d;
  const tab = query.tab ?? "all";
  const q = query.q?.trim().toLowerCase().replace(/^#/, "");
  const items = orders
    .filter((o) => inTab(o, tab))
    .filter((o) => !query.payment || o.payment === query.payment)
    .filter((o) => !query.month || monthKey(o.placedAt) === query.month)
    .filter((o) => !q || o.code.toLowerCase().includes(q) || (memberById.get(o.memberId)?.fullName.toLowerCase().includes(q) ?? false))
    .slice(0, 80)
    .map((o) => toItem(d, o));

  const tabs: OrdersTab[] = ["all", "to_process", "shipped", "completed", "cancelled"];
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

export async function getOrder(code: string): Promise<OrderDetail | null> {
  const d = await getDataset();
  const o = d.orders.find((x) => x.code === code);
  if (!o) return null;
  const member = d.memberById.get(o.memberId);
  const previousOrders = d.ordersOf(o.memberId).filter((x) => x.placedAt < o.placedAt).length;
  const items = o.items.map((i) => ({ name: i.name, variant: i.variant, image: productBySlug.get(i.productSlug)?.image ?? "", price: i.price, quantity: i.quantity }));
  const base = { ...toItem(d, o), customerTier: d.stats(o.memberId).tier, customerPhone: member?.phone ?? "", previousOrders, items };
  if (o.detail) {
    return {
      ...base,
      channel: o.detail.channel === "kuy" ? "Kuy" : "Website",
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
