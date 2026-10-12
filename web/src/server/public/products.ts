import "server-only";
import { cache } from "react";
import {
  productDetails as contentDetails,
  products as contentProducts,
  type Product,
  type ProductCategory,
  type ProductDetail,
  type ProductOptionGroup,
} from "@/content/products";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Katalog Shop untuk website. Dengan Supabase: produk berstatus "active" yang dikelola di
 * admin (harga, stok varian, foto, deskripsi). Pilihan varian kaya (type/warna) dari konten
 * statis tetap dipakai bila ada; produk baru memakai varian dari database.
 */

export type ShopCatalog = { products: Product[]; details: Record<string, ProductDetail> };

type Row = {
  slug: string;
  sku: string;
  name: string;
  category: ProductCategory;
  price: number;
  compare_at_price: number | null;
  description: string | null;
  details: string[];
  material: string | null;
  is_featured: boolean;
  show_size_guide: boolean;
  product_images: { path: string; alt: string; position: string | null; sort_order: number }[];
  product_variants: { options: Record<string, string>; stock: number }[];
};

const OPTION_LABEL: Record<string, string> = { size: "Pilih Ukuran", grip: "Pilih Grip", type: "Pilih Type", color: "Pilih Warna" };

/** Grup pilihan dari varian database (mis. {"size":"L"}) — satu grup per kunci. */
function optionsFromVariants(variants: Row["product_variants"]): ProductOptionGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const v of variants) for (const [key, value] of Object.entries(v.options ?? {})) groups.set(key, (groups.get(key) ?? new Set()).add(value));
  return [...groups].map(([key, values]) => ({ key, label: OPTION_LABEL[key] ?? `Pilih ${key}`, values: [...values].map((value) => ({ value, label: value })) }));
}

export const getShopCatalog = cache(async (): Promise<ShopCatalog> => {
  const fallback = { products: contentProducts, details: contentDetails };
  if (!isSupabaseConfigured) return fallback;

  const { data, error } = await createSupabasePublicClient()
    .from("products")
    .select("slug, sku, name, category, price, compare_at_price, description, details, material, is_featured, show_size_guide, product_images(path, alt, position, sort_order), product_variants(options, stock)")
    .eq("status", "active")
    .order("sort_order");
  if (error || !data) {
    console.error("[products] gagal memuat dari Supabase:", error?.message);
    return fallback;
  }

  const products: Product[] = [];
  const details: Record<string, ProductDetail> = {};
  for (const p of data as unknown as Row[]) {
    const images = [...p.product_images].sort((a, b) => a.sort_order - b.sort_order);
    const content = contentProducts.find((c) => c.slug === p.slug);
    const contentDetail = contentDetails[p.slug];
    const cover = images[0];
    products.push({
      slug: p.slug,
      sku: p.sku,
      name: p.name,
      category: p.category,
      price: p.price,
      compareAtPrice: p.compare_at_price ?? undefined,
      image: cover?.path ?? content?.image ?? "/images/home/product-a-piece-of-bali.webp",
      imagePosition: cover?.position ?? content?.imagePosition,
      featured: p.is_featured,
      stock: p.product_variants.reduce((sum, v) => sum + v.stock, 0),
    });
    details[p.slug] = {
      description: p.description ?? contentDetail?.description ?? "",
      details: p.details?.length ? p.details : (contentDetail?.details ?? []),
      material: p.material ?? contentDetail?.material ?? "",
      options: contentDetail?.options ?? optionsFromVariants(p.product_variants),
      gallery: images.length ? images.map((i) => ({ src: i.path, alt: i.alt || p.name, position: i.position ?? undefined })) : (contentDetail?.gallery ?? []),
      sizeGuide: p.show_size_guide,
    };
  }
  return { products, details };
});
