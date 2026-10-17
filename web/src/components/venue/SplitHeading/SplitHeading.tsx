import type { ReactNode } from "react";
import styles from "./SplitHeading.module.css";

/** Judul 2 baris di kiri + deskripsi (dan aksi) di kanan — heading section Venue detail v2. */
export function SplitHeading({ id, title, description, action }: { id: string; title: string[]; description: string; action?: ReactNode }) {
  return (
    <header className={styles.heading}>
      <h2 id={id} className={styles.title} data-anim="split">
        {title[0]}
        <br />
        {title[1]}
      </h2>
      <div className={styles.headingRight}>
        <p className={styles.description} data-anim="fade-up">
          {description}
        </p>
        {action}
      </div>
    </header>
  );
}
