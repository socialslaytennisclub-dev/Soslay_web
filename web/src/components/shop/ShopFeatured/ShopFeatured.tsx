import { Container, ProductCard, SectionIntro } from "@/components/ui";
import { productCardProps, shopPage, type Product } from "@/content/products";
import styles from "./ShopFeatured.module.css";

/** Figma 25:1355 — judul "Beyond the Court." + 2 produk unggulan (Card/Product 424px). */
export function ShopFeatured({ products }: { products: Product[] }) {
  return (
    <section className={styles.section} aria-labelledby="shop-featured-title">
      <Container className={styles.inner}>
        <SectionIntro id="shop-featured-title" {...shopPage.featured} className={styles.intro} />
        <ul className={styles.products} data-anim="stagger">
          {products.map((product) => (
            <li key={product.slug}>
              <ProductCard {...productCardProps(product)} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
