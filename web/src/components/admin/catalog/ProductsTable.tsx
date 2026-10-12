"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { setProductVisible } from "@/server/admin/actions/catalog";
import type { AdminProduct } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, desktopOnlyClass, MobileCard, MobileCardList } from "../ui/AdminUI";
import styles from "./Catalog.module.css";

type Props = { initial: AdminProduct[]; categories: { value: string; label: string }[]; lowStock: number; initialNotice?: string };

/** Admin / 08 Products (Figma 25:6156). Filter di browser — katalog kecil (puluhan produk). */
export function ProductsTable({ initial, categories, lowStock, initialNotice }: Props) {
  const [items, setItems] = useState(initial);
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(initialNotice ? { text: initialNotice } : null);
  const [pending, startToggle] = useTransition();

  const toggleVisible = (p: AdminProduct) => {
    const next = !p.visible;
    const apply = (visible: boolean) => setItems((list) => list.map((x) => (x.slug === p.slug ? { ...x, visible, status: visible ? "active" : "draft" } : x)));
    apply(next); // optimistis — dikembalikan kalau gagal
    startToggle(async () => {
      const result = await setProductVisible(p.slug, next);
      if (!result.ok) apply(!next);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
    });
  };

  const needle = q.trim().toLowerCase();
  const shown = items
    .filter((p) => category === "all" || p.category === category)
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
    .filter((p) => !status || (status === "visible") === p.visible)
    .filter((p) => !stock || p.stockState === stock);

  const low = items.filter((p) => p.stockState === "low").length;
  const out = items.filter((p) => p.stockState === "out").length;

  const stockBadge = (p: AdminProduct) =>
    p.stockState === "ok" ? (
      <span className={styles.stockValue}>{p.stock}</span>
    ) : (
      <Badge tone="pink" dot>
        {p.stockState === "out" ? "Habis" : `${p.stock} · menipis`}
      </Badge>
    );

  const price = (p: AdminProduct) => (
    <span className={styles.price}>
      <strong>{formatRupiahPlain(p.price)}</strong>
      {p.compareAtPrice && <s>{formatRupiahPlain(p.compareAtPrice)}</s>}
    </span>
  );

  const product = (p: AdminProduct) => (
    <span className={styles.product}>
      <span className={styles.productThumb}>
        <Image src={p.image} alt="" fill sizes="44px" />
      </span>
      <span className={styles.productText}>
        <Link href={`/admin/products/${p.slug}`} className={styles.strongLink}>
          {p.name}
        </Link>
        <span className={styles.muted}>{p.sku}</span>
      </span>
    </span>
  );

  const toggle = (p: AdminProduct) => (
    <button
      type="button"
      role="switch"
      aria-checked={p.visible}
      aria-label={`Tampilkan ${p.name} di Shop`}
      className={cx(styles.switch, p.visible && styles.switchOn)}
      disabled={pending}
      onClick={() => toggleVisible(p)}
    >
      <span />
    </button>
  );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.pillTabs} role="group" aria-label="Kategori">
          {[{ value: "all", label: "Semua" }, ...categories].map((c) => (
            <button key={c.value} type="button" aria-pressed={category === c.value} className={cx(styles.pillTab, category === c.value && styles.pillTabActive)} onClick={() => setCategory(c.value)}>
              {c.label}
              <span className={styles.tabCount}>{c.value === "all" ? items.length : items.filter((p) => p.category === c.value).length}</span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <AdminButton href="/admin/products/new" variant="primary" icon="plus-bold">
            Tambah produk
          </AdminButton>
        </div>
      </div>

      {(low > 0 || out > 0) && (
        <div className={styles.alert} role="note">
          <AdminIcon name="warning-circle" size={18} />
          <span>
            {low > 0 && `${low} produk stoknya menipis (≤ ${lowStock})`}
            {low > 0 && out > 0 && " dan "}
            {out > 0 && `${out} habis`}. Restock sebelum drop berikutnya.
          </span>
          <button type="button" className={styles.alertLink} onClick={() => setStock(low > 0 ? "low" : "out")}>
            Lihat produk
            <AdminIcon name="caret-right" size={14} />
          </button>
        </div>
      )}

      {notice && (
        <p className={cx(styles.notice, notice.error && styles.noticeError)} role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      <section className={styles.panel}>
        <div className={styles.filters}>
          <label className={styles.search}>
            <AdminIcon name="magnifying-glass" size={18} />
            <span className="visually-hidden">Cari produk</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama produk atau SKU…" />
          </label>
          <label className={styles.select}>
            <AdminIcon name="eye" size={16} />
            <span className="visually-hidden">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Status: Semua</option>
              <option value="visible">Tampil</option>
              <option value="hidden">Disembunyikan</option>
            </select>
            <AdminIcon name="caret-down" size={14} />
          </label>
          <label className={styles.select}>
            <AdminIcon name="package" size={16} />
            <span className="visually-hidden">Stok</span>
            <select value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="">Stok: Semua</option>
              <option value="ok">Aman</option>
              <option value="low">Menipis</option>
              <option value="out">Habis</option>
            </select>
            <AdminIcon name="caret-down" size={14} />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>Tidak ada produk untuk filter ini.</p>
        ) : (
          <>
            <MobileCardList label="Daftar produk">
              {shown.map((p) => (
                <MobileCard
                  key={p.slug}
                  title={product(p)}
                  aside={toggle(p)}
                  meta={[
                    { label: "Harga", value: price(p) },
                    { label: "Stok", value: stockBadge(p) },
                    { label: "Terjual", value: p.sold },
                  ]}
                />
              ))}
            </MobileCardList>
            <div className={cx(styles.tableWrap, desktopOnlyClass)}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Kategori</th>
                    <th>Varian</th>
                    <th>Harga</th>
                    <th>Stok</th>
                    <th>Terjual</th>
                    <th>Tampil</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.slug} className={cx(!p.visible && styles.rowMuted)}>
                      <td>{product(p)}</td>
                      <td>{p.categoryLabel}</td>
                      <td>
                        <span className={styles.chips}>
                          {p.variants.slice(0, 4).map((v) => (
                            <span key={v} className={styles.chip}>
                              {v}
                            </span>
                          ))}
                          {p.variants.length > 4 && <span className={styles.muted}>+{p.variants.length - 4}</span>}
                        </span>
                      </td>
                      <td>{price(p)}</td>
                      <td>{stockBadge(p)}</td>
                      <td>{p.sold}</td>
                      <td>{toggle(p)}</td>
                      <td>
                        <span className={styles.rowActions}>
                          <Link href={`/admin/products/${p.slug}`} className={styles.iconLink} aria-label={`Edit ${p.name}`}>
                            <AdminIcon name="pencil-simple" size={16} />
                          </Link>
                          <Link href={`/shop/${p.slug}`} target="_blank" className={styles.iconLink} aria-label={`Buka ${p.name} di Shop`}>
                            <AdminIcon name="arrow-up-right" size={16} />
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
