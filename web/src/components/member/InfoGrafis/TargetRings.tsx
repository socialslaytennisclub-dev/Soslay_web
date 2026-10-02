import type { CSSProperties } from "react";
import { annualTargets } from "@/content/member";
import { formatAngka } from "@/lib/format";
import styles from "./InfoGrafis.module.css";

/** Figma: chart/rings 150px — 3 cincin konsentris (stroke 14), dari luar: sesi, jam, venue. */
const SIZE = 150;
const STROKE = 14;
const RADII = [61, 42, 23];

export function TargetRings() {
  const { title, subtitle, rings } = annualTargets;

  return (
    <section className={styles.panel} aria-labelledby="target-rings-title">
      <div className={styles.panelHead}>
        <h3 id="target-rings-title" className={styles.panelTitle}>
          {title}
        </h3>
        <p className={styles.panelSubtitle}>{subtitle}</p>
      </div>

      <div className={styles.ringsBody}>
        <svg className={styles.rings} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          {rings.map((ring, index) => {
            const r = RADII[index];
            const circumference = 2 * Math.PI * r;
            const ratio = Math.min(ring.value / ring.target, 1);
            return (
              <g key={ring.key}>
                <circle className={styles.ringTrack} cx={SIZE / 2} cy={SIZE / 2} r={r} strokeWidth={STROKE} />
                <circle
                  className={`${styles.ringProgress} ${styles[ring.color]}`}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={r}
                  strokeWidth={STROKE}
                  strokeDasharray={circumference}
                  style={{ "--ring-length": circumference, "--ring-offset": circumference * (1 - ratio) } as CSSProperties}
                />
              </g>
            );
          })}
        </svg>

        <dl className={styles.legend}>
          {rings.map((ring) => (
            <div key={ring.key} className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles[ring.color]}`} aria-hidden />
              <dt className={styles.legendLabel}>{ring.label}</dt>
              <dd className={styles.legendValue}>
                <strong>{formatAngka(ring.value)}</strong> / {formatAngka(ring.target)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
