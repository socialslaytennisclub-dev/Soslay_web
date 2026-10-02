import { Accordion, Button, Container, Icon, Text } from "@/components/ui";
import { productPage, type Product, type ProductDetail } from "@/content/products";
import { cx } from "@/lib/cx";
import { ProductGallery } from "../ProductGallery/ProductGallery";
import { ProductPurchase } from "../ProductPurchase/ProductPurchase";
import styles from "./ProductDetailSection.module.css";

type ProductDetailSectionProps = {
  product: Product;
  detail: ProductDetail;
};

const rupiah = new Intl.NumberFormat("id-ID");

/** Figma 25:1631 — galeri kiri (710px) + info produk kanan (535px). */
export function ProductDetailSection({ product, detail }: ProductDetailSectionProps) {
  const soldOut = product.stock === 0;

  return (
    <section className={styles.section} aria-labelledby="product-title">
      <Container className={styles.layout}>
        <ProductGallery images={detail.gallery} />

        <div className={styles.info}>
          <div className={styles.main}>
            <div className={styles.heading}>
              <Text as="h1" id="product-title" variant="heading-42" tone="primary" data-anim="split">
                {product.name}
              </Text>
              {/* Figma: "RP." Inter Bold 18 + angka Poppins Bold 20; harga coret abu */}
              <p className={styles.price} data-anim="fade-up">
                <span className={styles.current}>
                  <span className={styles.currency}>RP.</span>
                  {rupiah.format(product.price)}
                </span>
                {product.compareAtPrice && (
                  <s className={cx(styles.current, styles.compare)}>
                    <span className="visually-hidden">Harga normal </span>
                    <span className={styles.currency}>RP.</span>
                    {rupiah.format(product.compareAtPrice)}
                  </s>
                )}
              </p>
            </div>

            <ProductPurchase
              product={{ slug: product.slug, name: product.name, price: product.price, image: product.image }}
              options={detail.options}
              soldOut={soldOut}
              showSizeGuide={detail.sizeGuide}
            />

            {/* Figma: info/login-banner */}
            <div className={styles.banner}>
              <Icon name="info" />
              <p className={styles.bannerText}>{productPage.loginBanner.text}</p>
              <Button href={productPage.loginBanner.href} variant="indigo" size="sm">
                {productPage.loginBanner.cta}
              </Button>
            </div>

            <Text variant="body-14" tone="primary" muted className={styles.description}>
              {detail.description}
            </Text>
          </div>

          <Accordion
            items={[
              {
                title: productPage.accordion.details,
                content: (
                  <ul>
                    {detail.details.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    <li>SKU: {product.sku}</li>
                  </ul>
                ),
              },
              { title: productPage.accordion.material, content: <p>{detail.material}</p> },
            ]}
          />
        </div>
      </Container>
    </section>
  );
}
