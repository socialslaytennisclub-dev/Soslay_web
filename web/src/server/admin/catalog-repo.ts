import "server-only";
import { cache } from "react";
import { LOW_STOCK, productCategories, productDetails, products as contentProducts } from "@/content/products";
import { venueList } from "@/content/venues";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset } from "./dataset";
import { monthKey } from "./time";
import type { AdminProduct, AdminVenue, ProductForm, StockState, VenueForm } from "./types";

/**
 * Data Venues & Products untuk admin. Live: tabel venues / products (+ images, variants),
 * termasuk yang disembunyikan. Demo: konten statis diubah ke bentuk yang sama.
 */

// ── Venues ──────────────────────────────────────────────────────────────────
const DEMO_COURTS: Record<string, number> = {
  "ayana-midplaza-jakarta": 4,
  "raffles-hotel-jakarta": 2,
  "common-grounds-menteng": 3,
  "maison-playcourt": 6,
  "kula-mani-tennis-village": 4,
  "swan-paradise-pramana": 2,
};

const loadVenueForms = cache(async (): Promise<VenueForm[]> => {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("venues").select("*").order("sort_order").order("name");
    if (error) throw new Error(`Gagal memuat venue: ${error.message}`);
    return (data ?? []).map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      city: v.city === "Bali" ? "Bali" : "Jakarta",
      area: v.area ?? "",
      type: v.venue_type ?? "",
      address: v.address ?? "",
      mapsUrl: v.maps_url ?? "",
      tagline: v.tagline ?? "",
      description: v.description ?? "",
      coverPath: v.cover_path ?? "",
      heroPath: v.hero_path ?? "",
      courts: v.courts ?? [],
      active: v.is_active,
      homepage: v.show_on_homepage,
    }));
  }
  return venueList.map((v) => ({
    id: null,
    slug: v.slug,
    name: v.name,
    city: v.city,
    area: "",
    type: v.type,
    address: "",
    mapsUrl: "",
    tagline: v.tagline,
    description: v.description,
    coverPath: v.image,
    heroPath: v.heroImage ?? "",
    courts: Array.from({ length: DEMO_COURTS[v.slug] ?? 2 }, (_, i) => `Court ${i + 1}`),
    active: true,
    homepage: true,
  }));
});

export async function listVenues(): Promise<AdminVenue[]> {
  const [venues, { bookings, sessions, now }] = await Promise.all([loadVenueForms(), getDataset()]);
  const thisMonth = monthKey(now);
  const booked = new Map<string, number>();
  for (const b of bookings) if (b.status !== "cancelled" && b.status !== "waitlisted") booked.set(b.sessionId, (booked.get(b.sessionId) ?? 0) + 1);

  return venues.map((v) => {
    const all = sessions.filter((s) => s.venueName === v.name && s.status !== "cancelled" && s.status !== "draft");
    const month = all.filter((s) => monthKey(s.startsAt) === thisMonth);
    const seats = month.reduce((sum, s) => sum + s.capacity, 0);
    const filled = month.reduce((sum, s) => sum + Math.min(booked.get(s.id) ?? 0, s.capacity), 0);
    return {
      slug: v.slug,
      name: v.name,
      city: v.city,
      type: v.type,
      image: v.coverPath || "/images/home/venue-common-grounds.webp",
      courts: v.courts.length,
      sessionsThisMonth: month.length,
      occupancy: seats ? Math.round((filled / seats) * 100) : null,
      sessionsTotal: all.length,
      visible: v.active,
      note: all.length === 0 ? "belum ada sesi" : undefined,
    };
  });
}

/** Pilihan venue untuk editor sesi (termasuk yang disembunyikan). */
export async function venueChoices() {
  return (await loadVenueForms()).map((v) => ({ name: v.name, city: v.city, image: v.coverPath || "/images/home/venue-common-grounds.webp", courts: v.courts }));
}

export async function getVenueForm(slug: string): Promise<VenueForm | null> {
  return (await loadVenueForms()).find((v) => v.slug === slug) ?? null;
}

export function emptyVenueForm(): VenueForm {
  return { id: null, slug: "", name: "", city: "Jakarta", area: "", type: "Outdoor", address: "", mapsUrl: "", tagline: "", description: "", coverPath: "", heroPath: "", courts: ["Court 1"], active: false, homepage: false };
}

/** Foto yang sudah ada di website — pilihan cover sampai upload (Supabase Storage) tersedia. */
export function siteImageOptions(): string[] {
  const set = new Set<string>([
    ...venueList.flatMap((v) => [v.image, v.heroImage].filter((x): x is string => Boolean(x))),
    ...contentProducts.map((p) => p.image),
    ...Object.values(productDetails).flatMap((d) => d.gallery.map((g) => g.src)),
    "/images/activity/featured-altitude.webp",
  ]);
  return [...set].sort();
}

// ── Products ────────────────────────────────────────────────────────────────
const loadProductForms = cache(async (): Promise<ProductForm[]> => {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("*, product_images(path, alt, position, sort_order), product_variants(options, stock)")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(`Gagal memuat produk: ${error.message}`);
    return (data ?? []).map((p) => {
      const variants = (p.product_variants as { options: Record<string, string>; stock: number }[]) ?? [];
      const optionKey = Object.keys(variants[0]?.options ?? {})[0] ?? "";
      return {
        id: p.id,
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        category: p.category,
        price: p.price,
        compareAtPrice: p.compare_at_price,
        description: p.description ?? "",
        details: p.details ?? [],
        material: p.material ?? "",
        status: p.status,
        featured: p.is_featured,
        sizeGuide: p.show_size_guide,
        images: ((p.product_images as { path: string; alt: string; position: string | null; sort_order: number }[]) ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => ({ path: i.path, alt: i.alt, position: i.position ?? "" })),
        optionKey,
        variants: variants.map((v) => ({ value: optionKey ? (v.options[optionKey] ?? "") : "default", stock: v.stock })),
      } satisfies ProductForm;
    });
  }
  return contentProducts.map((p) => {
    const d = productDetails[p.slug];
    const group = d?.options.find((g) => g.key === "size") ?? d?.options.find((g) => !g.values.some((v) => v.hex));
    const values = group?.values ?? [{ value: "default", label: "Default" }];
    return {
      id: null,
      slug: p.slug,
      sku: p.sku,
      name: p.name,
      category: p.category,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? null,
      description: d?.description ?? "",
      details: d?.details ?? [],
      material: d?.material ?? "",
      status: p.stock > 0 ? "active" : "draft",
      featured: Boolean(p.featured),
      sizeGuide: Boolean(d?.sizeGuide),
      images: (d?.gallery ?? [{ src: p.image, alt: p.name }]).map((g) => ({ path: g.src, alt: g.alt, position: g.position ?? "" })),
      optionKey: group?.key ?? "",
      variants: values.map((v, i) => ({ value: v.value, stock: Math.floor(p.stock / values.length) + (i < p.stock % values.length ? 1 : 0) })),
    } satisfies ProductForm;
  });
});

function stockState(stock: number): StockState {
  return stock === 0 ? "out" : stock <= LOW_STOCK ? "low" : "ok";
}

export async function listProducts(): Promise<AdminProduct[]> {
  const [forms, { orders }] = await Promise.all([loadProductForms(), getDataset()]);
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const item of o.items) sold.set(item.name, (sold.get(item.name) ?? 0) + item.quantity);
  }
  return forms.map((p) => {
    const stock = p.variants.reduce((sum, v) => sum + v.stock, 0);
    return {
      slug: p.slug,
      sku: p.sku,
      name: p.name,
      category: p.category,
      categoryLabel: productCategories.find((c) => c.slug === p.category)?.label ?? (p.category === "accessory" ? "Aksesoris" : p.category),
      image: p.images[0]?.path ?? "/images/home/product-a-piece-of-bali.webp",
      variants: p.optionKey ? p.variants.map((v) => v.value) : [],
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? undefined,
      stock,
      stockState: stockState(stock),
      sold: sold.get(p.name) ?? 0,
      visible: p.status === "active",
      status: p.status,
    };
  });
}

export async function getProductForm(slug: string): Promise<ProductForm | null> {
  return (await loadProductForms()).find((p) => p.slug === slug) ?? null;
}

export function emptyProductForm(): ProductForm {
  return {
    id: null,
    slug: "",
    sku: "",
    name: "",
    category: "apparel",
    price: 0,
    compareAtPrice: null,
    description: "",
    details: [],
    material: "",
    status: "draft",
    featured: false,
    sizeGuide: false,
    images: [],
    optionKey: "size",
    variants: ["S", "M", "L", "XL"].map((value) => ({ value, stock: 0 })),
  };
}

export function productCategoryOptions() {
  return [...productCategories.map((c) => ({ value: c.slug, label: c.label })), { value: "accessory", label: "Aksesoris" }];
}
