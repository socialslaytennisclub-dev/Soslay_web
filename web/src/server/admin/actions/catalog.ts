"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductForm, VenueForm } from "../types";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Simpan Products & Venues dari admin ke Supabase; website Shop / Venue ikut diperbarui. */

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const isImagePath = (p: string) => /^(\/images\/|https:\/\/)/.test(p);

// ── Products ────────────────────────────────────────────────────────────────
function refreshShop(slug?: string) {
  refreshPaths("/shop", "/", ["/shop/[slug]", "page"], "/admin/products", ...(slug ? [`/admin/products/${slug}`] : []));
}

function validateProduct(p: ProductForm): string | null {
  if (!p.name.trim()) return "Nama produk wajib diisi.";
  if (!p.sku.trim()) return "SKU wajib diisi.";
  if (!["apparel", "racket", "accessory"].includes(p.category)) return "Kategori tidak dikenal.";
  if (!Number.isInteger(p.price) || p.price < 0) return "Harga tidak valid.";
  if (p.compareAtPrice !== null && (!Number.isInteger(p.compareAtPrice) || p.compareAtPrice < p.price)) return "Harga coret harus lebih besar dari harga jual.";
  if (!["draft", "active", "archived"].includes(p.status)) return "Status tidak dikenal.";
  if (!p.variants.length) return "Minimal satu varian.";
  if (p.variants.some((v) => !v.value.trim() || !Number.isInteger(v.stock) || v.stock < 0)) return "Setiap varian butuh nama dan stok ≥ 0.";
  if (new Set(p.variants.map((v) => v.value.trim().toLowerCase())).size !== p.variants.length) return "Nama varian tidak boleh dobel.";
  if (p.images.some((i) => !isImagePath(i.path))) return "Path foto harus diawali /images/ atau https://.";
  return null;
}

export async function saveProduct(input: ProductForm): Promise<ActionResult> {
  const auth = await requireEditor("products");
  if ("error" in auth) return fail(auth.error);
  const invalid = validateProduct(input);
  if (invalid) return fail(invalid);

  const supabase = await createSupabaseServerClient();
  const row = {
    name: input.name.trim(),
    sku: input.sku.trim().toUpperCase(),
    category: input.category,
    price: input.price,
    compare_at_price: input.compareAtPrice,
    description: input.description.trim() || null,
    details: input.details.map((d) => d.trim()).filter(Boolean),
    material: input.material.trim() || null,
    status: input.status,
    is_featured: input.featured,
    show_size_guide: input.sizeGuide,
  };

  let id = input.id;
  let slug = input.slug;
  if (id) {
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) return fail(error.code === "23505" ? "SKU sudah dipakai produk lain." : `Gagal menyimpan: ${error.message}`);
  } else {
    slug = `${slugify(input.name)}-${crypto.randomUUID().slice(0, 4)}`;
    const { data, error } = await supabase.from("products").insert({ ...row, slug }).select("id").single();
    if (error) return fail(error.code === "23505" ? "SKU sudah dipakai produk lain." : `Gagal membuat produk: ${error.message}`);
    id = data.id as string;
  }

  // Foto: ganti seluruh daftar (urutan = urutan di form, foto pertama = cover).
  await supabase.from("product_images").delete().eq("product_id", id);
  if (input.images.length) {
    const { error } = await supabase
      .from("product_images")
      .insert(input.images.map((img, i) => ({ product_id: id, path: img.path, alt: img.alt || input.name, position: img.position || null, sort_order: i })));
    if (error) return fail(`Produk tersimpan, tapi foto gagal: ${error.message}`);
  }

  // Varian: upsert per pilihan, hapus yang dibuang (order lama menyimpan snapshot nama, aman).
  const key = input.optionKey.trim();
  const sku = row.sku;
  const wanted = input.variants.map((v) => ({
    product_id: id,
    sku: `${sku}-${slugify(v.value).toUpperCase() || "DEFAULT"}`,
    options: key ? { [key]: v.value.trim() } : {},
    stock: v.stock,
  }));
  const { data: existing } = await supabase.from("product_variants").select("id, sku").eq("product_id", id);
  const keep = new Set(wanted.map((w) => w.sku));
  const removed = (existing ?? []).filter((v) => !keep.has(v.sku as string)).map((v) => v.id as string);
  if (removed.length) await supabase.from("product_variants").delete().in("id", removed);
  const { error: variantError } = await supabase.from("product_variants").upsert(wanted, { onConflict: "sku" });
  if (variantError) return fail(`Produk tersimpan, tapi varian gagal: ${variantError.message}`);

  await audit(auth.userId, `${input.id ? "mengubah" : "menambah"} produk ${row.name}`, "product", id);
  refreshShop(slug);
  if (!input.id) redirect(`/admin/products/${slug}?saved=1`);
  return done(input.status === "active" ? "Produk tersimpan dan tampil di Shop." : "Produk tersimpan (tidak tampil di Shop).");
}

/** Tampil/sembunyi di Shop (switch di tabel Products). */
export async function setProductVisible(slug: string, visible: boolean): Promise<ActionResult> {
  const auth = await requireEditor("products");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").update({ status: visible ? "active" : "draft" }).eq("slug", slug).select("id, name");
  if (error || !data?.length) return fail(`Gagal mengubah: ${error?.message ?? "produk tidak ditemukan"}`);
  await audit(auth.userId, `${visible ? "menampilkan" : "menyembunyikan"} produk ${data[0].name}`, "product", data[0].id);
  refreshShop(slug);
  return done(visible ? `${data[0].name} tampil di Shop.` : `${data[0].name} disembunyikan dari Shop.`);
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const auth = await requireEditor("products");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("name, slug");
  if (error || !data?.length) return fail(`Gagal menghapus: ${error?.message ?? "produk tidak ditemukan"}`);
  await audit(auth.userId, `menghapus produk ${data[0].name}`, "product", id);
  refreshShop(data[0].slug);
  redirect("/admin/products?deleted=1");
}

// ── Venues ──────────────────────────────────────────────────────────────────
function refreshVenues(slug?: string) {
  refreshPaths("/venue", "/", "/activity", ["/venue/[slug]", "page"], "/admin/venues", ...(slug ? [`/admin/venues/${slug}`] : []));
}

function validateVenue(v: VenueForm): string | null {
  if (!v.name.trim()) return "Nama venue wajib diisi.";
  if (!["Jakarta", "Bali"].includes(v.city)) return "Kota harus Jakarta atau Bali.";
  if (v.coverPath && !isImagePath(v.coverPath)) return "Path foto cover harus diawali /images/ atau https://.";
  if (v.heroPath && !isImagePath(v.heroPath)) return "Path foto hero harus diawali /images/ atau https://.";
  if (v.mapsUrl && !/^https:\/\//.test(v.mapsUrl)) return "Link Maps harus https://.";
  if (!v.courts.filter((c) => c.trim()).length) return "Minimal satu lapangan.";
  return null;
}

export async function saveVenue(input: VenueForm): Promise<ActionResult> {
  const auth = await requireEditor("venues");
  if ("error" in auth) return fail(auth.error);
  const invalid = validateVenue(input);
  if (invalid) return fail(invalid);

  const supabase = await createSupabaseServerClient();
  const row = {
    name: input.name.trim(),
    city: input.city,
    area: input.area.trim() || null,
    venue_type: input.type.trim() || null,
    address: input.address.trim() || null,
    maps_url: input.mapsUrl.trim() || null,
    tagline: input.tagline.trim() || null,
    description: input.description.trim() || null,
    cover_path: input.coverPath || null,
    hero_path: input.heroPath || null,
    courts: input.courts.map((c) => c.trim()).filter(Boolean),
    is_active: input.active,
    show_on_homepage: input.homepage,
  };

  let slug = input.slug;
  if (input.id) {
    const { error } = await supabase.from("venues").update(row).eq("id", input.id);
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
  } else {
    slug = slugify(input.name);
    const { error } = await supabase.from("venues").insert({ ...row, slug, sort_order: 50 });
    if (error) return fail(error.code === "23505" ? "Sudah ada venue dengan nama ini." : `Gagal membuat venue: ${error.message}`);
  }
  await audit(auth.userId, `${input.id ? "mengubah" : "menambah"} venue ${row.name}`, "venue", slug);
  refreshVenues(slug);
  if (!input.id) redirect(`/admin/venues/${slug}?saved=1`);
  return done(input.active ? "Venue tersimpan dan tampil di website." : "Venue tersimpan (disembunyikan dari website).");
}

export async function setVenueVisible(slug: string, visible: boolean): Promise<ActionResult> {
  const auth = await requireEditor("venues");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("venues").update({ is_active: visible }).eq("slug", slug).select("id, name");
  if (error || !data?.length) return fail(`Gagal mengubah: ${error?.message ?? "venue tidak ditemukan"}`);
  await audit(auth.userId, `${visible ? "menampilkan" : "menyembunyikan"} venue ${data[0].name}`, "venue", slug);
  refreshVenues(slug);
  return done(visible ? `${data[0].name} tampil di halaman Venue.` : `${data[0].name} disembunyikan dari website.`);
}
