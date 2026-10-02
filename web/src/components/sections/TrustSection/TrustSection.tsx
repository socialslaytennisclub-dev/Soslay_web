import { Container, Icon, Text, type IconName } from "@/components/ui";
import styles from "./TrustSection.module.css";

type TrustSectionProps = {
  title: string;
  items: readonly { icon: IconName; title: string; text: string }[];
};

/** Figma 25:1711 — "Belanja dengan rasa aman dan nyaman": kartu indigo dengan 3 poin & pemisah putus-putus. */
export function TrustSection({ title, items }: TrustSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="trust-title">
      <Container className={styles.inner}>
        <Text as="h2" id="trust-title" variant="heading-42" tone="primary" align="center" className={styles.title} data-anim="split">
          {title}
        </Text>
        <ul className={styles.card} data-anim="stagger">
          {items.map((item) => (
            <li key={item.title} className={styles.item}>
              <span className={styles.badge}>
                <Icon name={item.icon} size={42} />
              </span>
              <div className={styles.text}>
                <Text as="h3" variant="title-24" tone="primary">
                  {item.title}
                </Text>
                <Text variant="body-16" tone="primary" muted>
                  {item.text}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
