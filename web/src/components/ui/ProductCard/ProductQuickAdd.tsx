"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cx } from "@/lib/cx";
import { flyToCart } from "@/lib/fly-to-cart";
import { Icon } from "../Icon/Icon";
import styles from "./ProductCard.module.css";

/** Pilihan untuk tombol tas: nilai tetap + (opsional) satu grup yang dipilih di kartu, mis. ukuran. */
export type QuickAddOptions = {
  fixed: Record<string, string>;
  choice?: { key: string; label: string; values: string[] };
};

type ProductQuickAddProps = {
  product: { slug: string; name: string; price: number; image: string; href: string };
  /** undefined → produk dengan banyak pilihan; tombol membuka halaman produk. */
  options?: QuickAddOptions;
};

/**
 * Tombol tas di kartu produk. Tanpa pilihan → langsung masuk tas (bola terbang ke navbar).
 * Ada satu pilihan (ukuran) → popover kecil di atas tombol; pilih ukuran = masuk tas.
 */
export function ProductQuickAdd({ product, options }: ProductQuickAddProps) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, close, open);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!options) {
    return (
      <Link href={product.href} className={styles.quickAdd} aria-label={`Choose options for ${product.name}`}>
        <Icon name="shopping-bag-open" size={22} />
      </Link>
    );
  }

  const add = (from: HTMLElement, selection: Record<string, string>) => {
    flyToCart(from);
    cart.add({ productSlug: product.slug, name: product.name, price: product.price, image: product.image, options: { ...options.fixed, ...selection } });
    setAdded(true);
    setOpen(false);
  };
  const { choice } = options;

  return (
    <div ref={wrapRef} className={styles.quickWrap}>
      {choice && open && (
        <div id={popoverId} className={styles.quickPopover} role="group" aria-label={`${choice.label} — ${product.name}`}>
          <p className={styles.quickLabel}>{choice.label}</p>
          <div className={styles.quickChoices}>
            {choice.values.map((value) => (
              <button key={value} type="button" className={styles.quickChoice} onClick={() => add(buttonRef.current ?? wrapRef.current!, { [choice.key]: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={cx(styles.quickAdd, (added || open) && styles.quickAdded)}
        aria-label={added ? `${product.name} added to bag` : choice ? `${choice.label} for ${product.name}` : `Add ${product.name} to bag`}
        aria-expanded={choice ? open : undefined}
        aria-controls={choice ? popoverId : undefined}
        onClick={(event) => (choice ? setOpen((v) => !v) : add(event.currentTarget, {}))}
      >
        <Icon name={added ? "check-bold" : open ? "close" : "shopping-bag-open"} size={22} />
        <span className="visually-hidden" role="status">
          {added ? "Added to bag" : ""}
        </span>
      </button>
    </div>
  );
}
