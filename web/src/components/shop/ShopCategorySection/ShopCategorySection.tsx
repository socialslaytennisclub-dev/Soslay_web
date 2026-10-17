import { Container, ProductCard } from "@/components/ui";
import { productCardProps, type Product, type ProductDetail } from "@/content/products";
import { cx } from "@/lib/cx";
import styles from "./ShopCategorySection.module.css";

type ShopCategorySectionProps = {
  id: string;
  title: string;
  description: string;
  products: Product[];
  /** Detail produk (pilihan varian) → tombol tas di kartu bisa langsung menambah ke keranjang. */
  details: Record<string, ProductDetail>;
  /** Grid 3 kolom (default) atau carousel geser horizontal (Best Seller). */
  layout?: "grid" | "carousel";
};

/** Figma Website v2 347:2069 · 347:2086 — judul kategori + deskripsi, lalu kartu Card/Merch. */
export function ShopCategorySection({ id, title, description, products, details, layout = "grid" }: ShopCategorySectionProps) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <Container className={styles.inner}>
        <header className={styles.heading}>
          <h2 id={`${id}-title`} className={styles.title} data-anim="split">
            {title}
          </h2>
          <p className={styles.description} data-anim="fade-up">
            {description}
          </p>
        </header>
        <ul className={cx(styles.products, layout === "carousel" && styles.carousel)} data-anim="stagger">
          {products.map((product) => (
            <li key={product.slug}>
              <ProductCard {...productCardProps(product, details[product.slug])} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
