import { Button, Container, ProductCard, SectionIntro } from "@/components/ui";
import { shop } from "@/content/home";
import styles from "./Shop.module.css";

export function Shop() {
  return (
    <section className={styles.section} aria-labelledby="shop-title">
      <Container className={styles.layout}>
        <ul className={styles.products} data-anim="stagger">
          {shop.products.map((product) => (
            <li key={product.href}>
              <ProductCard {...product} />
            </li>
          ))}
        </ul>

        <div className={styles.intro}>
          <SectionIntro id="shop-title" title={shop.title} description={shop.description} />
          <div data-anim="fade-up">
            <Button href={shop.cta.href} variant="arrow" size="sm">
              {shop.cta.label}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
