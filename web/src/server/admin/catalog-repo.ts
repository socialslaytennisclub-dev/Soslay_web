import "server-only";
import { LOW_STOCK, productCategories, productDetails, products } from "@/content/products";
import { venueList } from "@/content/venues";
import { getDataset } from "./dataset";
import { monthKey } from "./time";
import type { AdminProduct, AdminVenue, StockState } from "./types";

/** Data Venues & Products untuk admin (tabel venues, products, product_variants). */

const COURTS: Record<string, number> = {
  "ayana-midplaza-jakarta": 4,
  "raffles-hotel-jakarta": 2,
  "common-grounds-menteng": 3,
  "maison-playcourt": 6,
  "kula-mani-tennis-village": 4,
  "swan-paradise-pramana": 2,
};

export async function listVenues(): Promise<AdminVenue[]> {
  const { bookings, sessions, now, venueMeta } = await getDataset();
  const thisMonth = monthKey(now);
  const booked = new Map<string, number>();
  for (const b of bookings) if (b.status !== "cancelled" && b.status !== "waitlisted") booked.set(b.sessionId, (booked.get(b.sessionId) ?? 0) + 1);

  return venueList.map((v) => {
    const all = sessions.filter((s) => s.venueName === v.name && s.status !== "cancelled" && s.status !== "draft");
    const month = all.filter((s) => monthKey(s.startsAt) === thisMonth);
    const seats = month.reduce((sum, s) => sum + s.capacity, 0);
    const filled = month.reduce((sum, s) => sum + Math.min(booked.get(s.id) ?? 0, s.capacity), 0);
    // Venue tanpa sesi sama sekali = venue baru yang belum dirilis.
    const isNew = all.length === 0;
    const meta = venueMeta?.get(v.name);
    return {
      slug: v.slug,
      name: v.name,
      city: v.city,
      type: v.type,
      image: v.image,
      courts: meta?.courts ?? COURTS[v.slug] ?? 2,
      sessionsThisMonth: month.length,
      occupancy: seats ? Math.round((filled / seats) * 100) : null,
      sessionsTotal: all.length,
      visible: meta ? meta.active : !isNew,
      note: isNew ? "rilis 19 Okt" : undefined,
    };
  });
}

function stockState(stock: number): StockState {
  return stock === 0 ? "out" : stock <= LOW_STOCK ? "low" : "ok";
}

export async function listProducts(): Promise<AdminProduct[]> {
  const { orders, productStock } = await getDataset();
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const item of o.items) sold.set(item.productSlug, (sold.get(item.productSlug) ?? 0) + item.quantity);
  }
  return products.map((p) => {
    const stock = productStock?.get(p.slug) ?? p.stock;
    const groups = productDetails[p.slug]?.options ?? [];
    // Varian yang ditampilkan: ukuran untuk apparel, grip untuk raket (grup tanpa warna).
    const group = groups.find((g) => g.key === "size") ?? groups.find((g) => !g.values.some((v) => v.hex));
    return {
      slug: p.slug,
      sku: p.sku,
      name: p.name,
      category: p.category,
      categoryLabel: productCategories.find((c) => c.slug === p.category)?.label ?? p.category,
      image: p.image,
      variants: group?.values.map((v) => v.label) ?? [],
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      stock,
      stockState: stockState(stock),
      sold: sold.get(p.slug) ?? 0,
      visible: stock > 0,
    };
  });
}

export function productCategoryOptions() {
  return productCategories.map((c) => ({ value: c.slug, label: c.label }));
}
