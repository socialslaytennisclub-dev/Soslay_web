import { marquee } from "@/content/home";
import styles from "./Marquee.module.css";

const REPEAT = 4;

/** Strip lime "PLAY. CONNECT. REPEAT." — gerak & reaksi scroll: src/animations/marquee.ts. */
export function Marquee() {
  const items = Array.from({ length: REPEAT }, (_, i) => i);

  return (
    <section className={styles.marquee} aria-label={marquee.text} data-marquee>
      {/* Dua track identik → loop mulus saat track pertama bergeser -100% */}
      {[0, 1].map((track) => (
        <div key={track} className={styles.track} aria-hidden data-marquee-track>
          {items.map((i) => (
            <span key={i} className={styles.item}>
              {marquee.text}
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}
