import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Accordion.module.css";

type AccordionProps = {
  items: { title: string; content: ReactNode }[];
};

/**
 * Figma: info/accordion (Detail Produk, Material) — judul Poppins Bold 20 + tombol plus bulat,
 * dipisah garis putus-putus. Pakai <details> native: bisa dibuka tanpa JS & aksesibel.
 */
export function Accordion({ items }: AccordionProps) {
  return (
    <div className={styles.accordion}>
      {items.map((item) => (
        <details key={item.title} className={styles.item}>
          <summary className={styles.summary}>
            <span className={styles.title}>{item.title}</span>
            <span className={styles.toggle} aria-hidden>
              <Icon name="plus-bold" size={20} />
            </span>
          </summary>
          <div className={styles.content}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}
