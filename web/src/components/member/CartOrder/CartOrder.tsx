"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button, Checkbox, Icon, QuantityStepper } from "@/components/ui";
import { orderPage } from "@/content/member";
import { describeVariant, findProduct, LOW_STOCK, productHref } from "@/content/products";
import { useCart } from "@/hooks/useCart";
import { cartItemKey, type CartItem } from "@/lib/cart";
import { formatRupiah } from "@/lib/format";
import styles from "./CartOrder.module.css";

/**
 * Figma 25:2112 — keranjang (dari localStorage via useCart) + ringkasan.
 * Item baru otomatis terpilih; yang di-uncheck disimpan di `excluded`.
 */
export function CartOrder() {
  const { items, count, hydrated, setQuantity, remove } = useCart();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const selected = items.filter((item) => !excluded.has(cartItemKey(item)));
  const selectedQty = selected.reduce((total, item) => total + item.quantity, 0);
  const subtotal = selected.reduce((total, item) => total + item.price * item.quantity, 0);
  const points = Math.floor(subtotal / orderPage.rupiahPerPoint);
  const allSelected = items.length > 0 && selected.length === items.length;

  const toggle = (key: string, checked: boolean) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = (checked: boolean) => setExcluded(checked ? new Set() : new Set(items.map(cartItemKey)));

  if (hydrated && items.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <Icon name="shopping-bag-open" size={40} className={styles.emptyIcon} />
        <h2 className={styles.emptyTitle}>{orderPage.empty.title}</h2>
        <p className={styles.muted}>{orderPage.empty.body}</p>
        <Button href={orderPage.continueShopping.href} variant="arrow">
          Lihat Shop
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <section className={styles.order} aria-labelledby="order-title" aria-busy={!hydrated}>
        <header className={styles.orderHeader}>
          <h2 id="order-title" className={styles.orderTitle}>
            {orderPage.title}
          </h2>
          <p className={styles.muted}>{hydrated ? `${count} produk di keranjang` : "Memuat keranjang…"}</p>
        </header>

        {hydrated && (
          <>
            <div className={styles.selectAll}>
              <Checkbox
                checked={allSelected}
                indeterminate={!allSelected && selected.length > 0}
                onChange={toggleAll}
              >
                {orderPage.selectAll}
              </Checkbox>
            </div>
            <ul className={styles.items}>
              {items.map((item) => {
                const key = cartItemKey(item);
                return (
                  <CartRow
                    key={key}
                    item={item}
                    checked={!excluded.has(key)}
                    onCheck={(checked) => toggle(key, checked)}
                    onQuantity={(quantity) => setQuantity(key, quantity)}
                    onRemove={() => remove([key])}
                  />
                );
              })}
            </ul>
          </>
        )}
      </section>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          {orderPage.summary}
        </h2>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>Subtotal ({selectedQty} produk)</dt>
            <dd>{formatRupiah(subtotal)}</dd>
          </div>
          <div className={styles.row}>
            <dt>{orderPage.shipping.label}</dt>
            <dd>{orderPage.shipping.value}</dd>
          </div>
          <div className={styles.total}>
            <dt>Total</dt>
            <dd>{formatRupiah(subtotal)}</dd>
          </div>
        </dl>
        {points > 0 && (
          <p className={styles.points}>
            <strong>+{points} pts</strong> {orderPage.pointsCopy}
          </p>
        )}
        {selected.length > 0 ? (
          <Button href={orderPage.checkout.href} variant="primary" className={styles.checkout}>
            {orderPage.checkout.label}
          </Button>
        ) : (
          <Button variant="primary" className={styles.checkout} disabled>
            {orderPage.checkout.label}
          </Button>
        )}
        <Link href={orderPage.continueShopping.href} className={styles.continue}>
          {orderPage.continueShopping.label}
        </Link>
      </aside>
    </div>
  );
}

type CartRowProps = {
  item: CartItem;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
};

function CartRow({ item, checked, onCheck, onQuantity, onRemove }: CartRowProps) {
  const product = findProduct(item.productSlug);
  const { color, chips } = describeVariant(item.productSlug, item.options);
  const stock = product?.stock;
  const availability =
    stock === 0
      ? "Stok habis"
      : stock !== undefined && stock <= LOW_STOCK
        ? `Sisa ${stock} · dikirim dalam 2–3 hari`
        : orderPage.availability;

  return (
    <li className={styles.item}>
      <Checkbox checked={checked} onChange={onCheck} label={`Pilih ${item.name}`} />
      <Link href={product ? productHref(product) : "/shop"} className={styles.photo} tabIndex={-1} aria-hidden>
        <Image src={item.image} alt="" fill sizes="160px" className={styles.image} />
      </Link>

      <div className={styles.info}>
        <h3 className={styles.name}>
          <Link href={product ? productHref(product) : "/shop"}>{item.name}</Link>
        </h3>
        {(color || chips.length > 0) && (
          <p className={styles.variant}>
            {color && (
              <>
                <span className={styles.swatch} style={{ background: color.hex }} aria-hidden />
                <span>{color.label}</span>
              </>
            )}
            {chips.map((chip) => (
              <span key={chip} className={styles.variantChip}>
                {chip}
              </span>
            ))}
          </p>
        )}
        <p className={styles.availability}>{availability}</p>
      </div>

      <div className={styles.actions}>
        <p className={styles.price}>{formatRupiah(item.price * item.quantity)}</p>
        <div className={styles.controls}>
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Hapus ${item.name}`}>
            <Icon name="trash" size={24} />
          </button>
          <QuantityStepper value={item.quantity} onChange={onQuantity} max={stock || 99} itemLabel={item.name} />
        </div>
      </div>
    </li>
  );
}
