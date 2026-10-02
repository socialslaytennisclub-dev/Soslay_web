import { Container, FilterChips, ProductCard, SectionIntro, Text, type FilterChip } from "@/components/ui";
import { productCardProps, productCategories, shopPage, type Product, type ProductCategory } from "@/content/products";
import styles from "./ShopCatalog.module.css";

type ShopCatalogProps = {
  products: Product[];
  activeCategory?: ProductCategory;
};

/** Figma 25:1394 — semua produk dalam grid 5 kolom (kartu katalog 246×369) + filter kategori. */
export function ShopCatalog({ products, activeCategory }: ShopCatalogProps) {
  const chips: FilterChip[] = [
    { label: "Semua", href: "/shop#koleksi", active: !activeCategory },
    ...productCategories.map((category) => ({
      label: category.label,
      href: `/shop?category=${category.slug}#koleksi`,
      active: category.slug === activeCategory,
    })),
  ];

  return (
    <section className={styles.section} aria-labelledby="shop-catalog-title" id="koleksi">
      <Container className={styles.inner}>
        <header className={styles.header}>
          <SectionIntro id="shop-catalog-title" title={shopPage.catalog.title} description={shopPage.catalog.description} className={styles.intro} />
          <FilterChips items={chips} label="Filter kategori produk" />
        </header>

        {products.length === 0 ? (
          <Text variant="body-16" tone="primary" muted className={styles.empty}>
            {shopPage.catalog.empty}
          </Text>
        ) : (
          <ul className={styles.grid} data-anim="stagger">
            {products.map((product) => (
              <li key={product.slug}>
                <ProductCard {...productCardProps(product)} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
