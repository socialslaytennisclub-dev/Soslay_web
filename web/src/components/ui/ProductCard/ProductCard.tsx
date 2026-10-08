import Image from "next/image";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { formatRupiah } from "@/lib/format";
import { Icon } from "../Icon/Icon";
import styles from "./ProductCard.module.css";
import { blurProps } from "@/lib/image";

export type ProductCardProps = {
  name: string;
  href: string;
  image: string;
  imagePosition?: string;
  price: number;
  compareAtPrice?: number;
  /** "sold-out" → label Habis (foto diredupkan); "low" → label Stok terbatas. */
  stock?: "sold-out" | "low";
  /**
   * lg = Card/Product unggulan (424×619, radius 12) — homepage & atas Shop.
   * sm = kartu katalog (246×369, radius 16) — grid "Semua Koleksi".
   */
  size?: "lg" | "sm";
};

const STOCK_LABEL = { "sold-out": "Habis", low: "Stok terbatas" } as const;

export function ProductCard({
  name,
  href,
  image,
  imagePosition = "50% 30%",
  price,
  compareAtPrice,
  stock,
  size = "lg",
}: ProductCardProps) {
  return (
    <Link href={href} className={cx(styles.card, styles[size], stock === "sold-out" && styles.soldOut)} data-cursor="Lihat">
      <div className={styles.media}>
        <Image
          className={styles.image}
          src={image} {...blurProps(image)}
          alt={name}
          fill
          sizes={size === "lg" ? "(min-width: 1200px) 424px, (min-width: 768px) 45vw, 90vw" : "(min-width: 1200px) 246px, (min-width: 768px) 30vw, 45vw"}
          style={{ objectPosition: imagePosition }}
        />
        {stock && <span className={cx(styles.stock, styles[stock])}>{STOCK_LABEL[stock]}</span>}
        <span className={styles.bag} aria-hidden>
          <Icon name="shopping-bag-open" size={32} />
        </span>
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        <p className={styles.prices}>
          <span className={styles.price}>{formatRupiah(price)}</span>
          {compareAtPrice && (
            <s className={styles.compare}>
              <span className="visually-hidden">Harga normal </span>
              {formatRupiah(compareAtPrice)}
            </s>
          )}
        </p>
      </div>
    </Link>
  );
}
