import { marquee } from "@/content/home";
import styles from "./Marquee.module.css";

const REPEAT = 4;

/**
 * Strip lime "PLAY CONNECT REPEAT" yang berjalan terus (loop CSS, lihat Marquee.module.css).
 * Titik di teks dibuang supaya terbaca sebagai satu baris berjalan.
 */
export function Marquee({ text = marquee.text }: { text?: string }) {
  const label = text.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const items = Array.from({ length: REPEAT }, (_, i) => i);

  return (
    <section className={styles.marquee} aria-label={label}>
      {/* Dua track identik → loop mulus saat track bergeser sejauh lebarnya sendiri */}
      {[0, 1].map((track) => (
        <div key={track} className={styles.track} aria-hidden>
          {items.map((i) => (
            <span key={i} className={styles.item}>
              {label}
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}
