import Image from "next/image";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { formatRupiah } from "@/lib/format";
import { blurProps } from "@/lib/image";
import styles from "./ProductCard.module.css";
import { ProductQuickAdd, type QuickAddOptions } from "./ProductQuickAdd";

export type ProductCardProps = {
  slug: string;
  name: string;
  /** Label kecil di atas nama, mis. "Oversized fit T-shirt". */
  subtitle?: string;
  href: string;
  image: string;
  imagePosition?: string;
  price: number;
  compareAtPrice?: number;
  /** "sold-out" → label Sold out (foto diredupkan); "low" → label Low stock. */
  stock?: "sold-out" | "low";
  /** Produk Best Seller → badge di pojok foto. */
  featured?: boolean;
  /** Pilihan untuk tombol tas (langsung / pilih ukuran di kartu); undefined → tombol membuka halaman produk. */
  quickAdd?: QuickAddOptions;
};

const STOCK_LABEL = { "sold-out": "Sold out", low: "Low stock" } as const;

/**
 * Kartu produk Shop: foto mockup "mengambang" di dalam kartu (inset + radius), badge diskon /
 * Best Seller / stok di pojok foto, label subtitle, harga + tombol tas di satu baris.
 * Seluruh kartu bisa diklik lewat link nama (::after); tombol tas berdiri di atasnya.
 */
export function ProductCard({ slug, name, subtitle, href, image, imagePosition = "50% 50%", price, compareAtPrice, stock, featured, quickAdd }: ProductCardProps) {
  const discount = compareAtPrice && compareAtPrice > price ? Math.round((1 - price / compareAtPrice) * 100) : 0;

  return (
    <article className={cx(styles.card, stock === "sold-out" && styles.soldOut)}>
      <div className={styles.media}>
        <Image
          className={styles.image}
          src={image}
          {...blurProps(image)}
          alt={name}
          fill
          sizes="(min-width: 1200px) 400px, (min-width: 768px) 45vw, 90vw"
          style={{ objectPosition: imagePosition }}
        />
        <div className={styles.badges}>
          {stock ? (
            <span className={cx(styles.badge, styles[stock])}>{STOCK_LABEL[stock]}</span>
          ) : (
            discount > 0 && <span className={cx(styles.badge, styles.discount)}>−{discount}%</span>
          )}
          {featured && stock !== "sold-out" && <span className={cx(styles.badge, styles.best)}>★ Best Seller</span>}
        </div>
      </div>

      <div className={styles.info}>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <Link href={href} className={styles.name} data-cursor="View">
          {name}
        </Link>
        <div className={styles.footer}>
          <p className={styles.prices}>
            <span className={styles.price}>{formatRupiah(price)}</span>
            {compareAtPrice && (
              <s className={styles.compare}>
                <span className="visually-hidden">Regular price </span>
                {formatRupiah(compareAtPrice)}
              </s>
            )}
          </p>
          {stock !== "sold-out" && <ProductQuickAdd product={{ slug, name, price, image, href }} options={quickAdd} />}
        </div>
      </div>
    </article>
  );
}
