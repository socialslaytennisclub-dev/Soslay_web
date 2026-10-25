"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { deleteProduct, saveProduct } from "@/server/admin/actions/catalog";
import type { ProductForm } from "@/server/admin/types";
import styles from "../activities/SessionEditor.module.css";
import { FormCard, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import own from "./Catalog.module.css";
import { toast, ToastOnMount } from "../ui/Toaster";

type Props = {
  initial: ProductForm;
  categories: { value: string; label: string }[];
  imageOptions: string[];
  initialNotice?: string;
};

const STATUS = [
  { value: "active", label: "Tampil di Shop" },
  { value: "draft", label: "Draft (tersembunyi)" },
  { value: "archived", label: "Arsip" },
] as const;

const OPTION_KEYS = [
  { value: "size", label: "Ukuran" },
  { value: "grip", label: "Grip" },
  { value: "", label: "Tanpa pilihan" },
];

const digits = (v: string) => v.replace(/\D/g, "");

/** Tambah / edit produk Shop. Foto memakai gambar yang sudah ada sampai upload tersedia. */
export function ProductEditor({ initial, categories, imageOptions, initialNotice }: Props) {
  const [p, setP] = useState(initial);
  const [saving, start] = useTransition();
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setP((prev) => ({ ...prev, [key]: value }));
  const isNew = !initial.id && !initial.slug;
  const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);

  const save = () =>
    start(async () => {
      const result = await saveProduct(p);
      toast.result(result);
    });

  const remove = () => {
    if (!p.id || !window.confirm(`Hapus produk "${p.name}"? Riwayat order tetap tersimpan.`)) return;
    start(async () => {
      const result = await deleteProduct(p.id!);
      if (!result.ok) toast.error(result.error);
    });
  };

  const setVariant = (i: number, change: Partial<ProductForm["variants"][number]>) =>
    set("variants", p.variants.map((v, j) => (j === i ? { ...v, ...change } : v)));
  const setImage = (i: number, change: Partial<ProductForm["images"][number]>) => set("images", p.images.map((img, j) => (j === i ? { ...img, ...change } : img)));
  const moveImage = (i: number, to: number) => {
    if (to < 0 || to >= p.images.length) return;
    const next = [...p.images];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item);
    set("images", next);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href="/admin/products" className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Products
          </Link>
          <Badge tone={p.status === "active" ? "lime" : "neutral"} dot>
            {STATUS.find((s) => s.value === p.status)?.label}
          </Badge>
        </div>
        <div className={styles.barActions}>
          {!isNew && (
            <>
              <AdminButton href={`/shop/${p.slug}`} target="_blank" size="sm" icon="eye">
                Lihat di Shop
              </AdminButton>
              <AdminButton size="sm" icon="trash" onClick={remove} disabled={saving}>
                Hapus
              </AdminButton>
            </>
          )}
          <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save} disabled={saving}>
            {saving ? "Menyimpan…" : isNew ? "Simpan produk" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      {initialNotice && <ToastOnMount text={initialNotice} />}

      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Info produk" subtitle="Tampil di kartu & halaman detail Shop">
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Nama produk *</span>
                <input className={styles.input} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. A Piece of Bali" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>SKU *</span>
                <input className={styles.input} value={p.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder="SOS-APP-010" />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Subjudul kartu</span>
              <input className={styles.input} value={p.subtitle} maxLength={80} onChange={(e) => set("subtitle", e.target.value)} placeholder="mis. Oversized fit T-shirt" />
            </label>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Kategori</legend>
              <div className={styles.segmentWrap}>
                {categories.map((c) => (
                  <button key={c.value} type="button" aria-pressed={p.category === c.value} className={cx(styles.option, p.category === c.value && styles.optionOn)} onClick={() => set("category", c.value as ProductForm["category"])}>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Fit (opsional)</span>
                <input className={styles.input} value={p.fit} onChange={(e) => set("fit", e.target.value)} placeholder="mis. Relaxed Fit – Semi-Oversized" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Warna (opsional)</span>
                <input className={styles.input} value={p.color} onChange={(e) => set("color", e.target.value)} placeholder="mis. Washed Black" />
              </label>
            </div>
            <TextArea label="Deskripsi" value={p.description} onChange={(v) => set("description", v)} maxLength={600} rows={4} />
            <TextArea label="Detail produk (satu poin per baris)" value={p.details.join("\n")} onChange={(v) => set("details", v.split("\n"))} maxLength={1200} rows={4} />
            <TextArea label="Material & perawatan" value={p.material} onChange={(v) => set("material", v)} maxLength={400} rows={2} />
          </FormCard>

          <FormCard title="Harga & varian" subtitle={`Total stok ${totalStock}`}>
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Harga jual *</span>
                <span className={styles.affix}>
                  <span className={styles.muted}>Rp</span>
                  <input inputMode="numeric" value={p.price} onChange={(e) => set("price", Number(digits(e.target.value)))} />
                </span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Harga coret (opsional)</span>
                <span className={styles.affix}>
                  <span className={styles.muted}>Rp</span>
                  <input inputMode="numeric" value={p.compareAtPrice ?? ""} onChange={(e) => set("compareAtPrice", digits(e.target.value) ? Number(digits(e.target.value)) : null)} />
                </span>
              </label>
            </div>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Pilihan varian</legend>
              <div className={styles.segmentWrap}>
                {OPTION_KEYS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={p.optionKey === o.value}
                    className={cx(styles.option, p.optionKey === o.value && styles.optionOn)}
                    onClick={() => setP((prev) => ({ ...prev, optionKey: o.value, variants: o.value ? prev.variants : [{ value: "default", stock: prev.variants.reduce((s, v) => s + v.stock, 0) }] }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <ul className={own.variantList}>
              {p.variants.map((v, i) => (
                <li key={i} className={own.variantRow}>
                  {p.optionKey ? (
                    <input className={styles.input} aria-label={`Nama varian ${i + 1}`} value={v.value} onChange={(e) => setVariant(i, { value: e.target.value })} placeholder="mis. XL" />
                  ) : (
                    <span className={styles.label}>Stok</span>
                  )}
                  <span className={styles.affix}>
                    <input inputMode="numeric" aria-label={`Stok varian ${v.value}`} value={v.stock} onChange={(e) => setVariant(i, { stock: Number(digits(e.target.value)) })} />
                    <span className={styles.muted}>pcs</span>
                  </span>
                  {p.optionKey && p.variants.length > 1 && (
                    <button type="button" className={styles.iconButton} aria-label={`Hapus varian ${v.value}`} onClick={() => set("variants", p.variants.filter((_, j) => j !== i))}>
                      <AdminIcon name="x" size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {p.optionKey && (
              <button type="button" className={styles.addCrew} onClick={() => set("variants", [...p.variants, { value: "", stock: 0 }])}>
                <AdminIcon name="plus-bold" size={14} />
                Tambah varian
              </button>
            )}
          </FormCard>

          <FormCard title="Foto" subtitle="Galeri halaman produk · foto pertama = foto utama">
            <ul className={own.imageList}>
              {p.images.map((img, i) => (
                <li key={`${img.path}-${i}`} className={own.imageRow}>
                  <span className={own.imageThumb}>{img.path && <Image src={img.path} alt="" fill sizes="64px" />}</span>
                  <span className={own.imageFields}>
                    <input className={styles.input} aria-label="Path foto" value={img.path} onChange={(e) => setImage(i, { path: e.target.value })} />
                    <input className={styles.input} aria-label="Teks alternatif" value={img.alt} onChange={(e) => setImage(i, { alt: e.target.value })} placeholder="Deskripsi foto (alt)" />
                  </span>
                  <span className={own.imageActions}>
                    <button type="button" className={styles.iconButton} aria-label="Naikkan" disabled={i === 0} onClick={() => moveImage(i, i - 1)}>
                      <AdminIcon name="caret-left" size={14} className={own.rotateUp} />
                    </button>
                    <button type="button" className={styles.iconButton} aria-label="Hapus foto" onClick={() => set("images", p.images.filter((_, j) => j !== i))}>
                      <AdminIcon name="x" size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <label className={styles.field}>
              <span className={styles.label}>Tambah foto dari website</span>
              <span className={styles.selectWrap}>
                <select
                  className={cx(styles.input, styles.select)}
                  value=""
                  onChange={(e) => e.target.value && set("images", [...p.images, { path: e.target.value, alt: p.name, position: "" }])}
                >
                  <option value="">Pilih foto…</option>
                  {imageOptions.map((src) => (
                    <option key={src} value={src}>
                      {src.replace("/images/", "")}
                    </option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
              <span className={styles.muted}>Upload foto baru aktif setelah Supabase Storage disiapkan.</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Foto kartu Shop (mockup)</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={p.cardImage} onChange={(e) => set("cardImage", e.target.value)}>
                  <option value="">Sama dengan foto pertama</option>
                  {[...new Set([...p.images.map((img) => img.path), ...imageOptions])].map((src) => (
                    <option key={src} value={src}>
                      {src.replace("/images/", "")}
                    </option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
            </label>
          </FormCard>
        </div>

        <aside className={styles.side}>
          <FormCard title="Publikasi">
            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={p.status} onChange={(e) => set("status", e.target.value as ProductForm["status"])}>
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
            </label>
            <Toggle label="Produk unggulan" hint="Tampil di homepage & atas halaman Shop" checked={p.featured} onChange={(v) => set("featured", v)} />
            <Toggle label="Panduan ukuran" hint='Link "Panduan Ukuran" di halaman produk' checked={p.sizeGuide} onChange={(v) => set("sizeGuide", v)} />
          </FormCard>
          {p.images[0] && (
            <FormCard title="Preview kartu">
              <div className={styles.preview}>
                <Image src={p.images[0].path} alt="" fill sizes="300px" />
                <span className={styles.previewText}>
                  <strong>{p.name || "Nama produk"}</strong>
                  <span>Rp{p.price.toLocaleString("id-ID")}</span>
                </span>
              </div>
            </FormCard>
          )}
        </aside>
      </div>
    </div>
  );
}
