import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import styles from "./NavyBackdrop.module.css";

/** Path swoosh asli dari Figma (node 25:494 "hero/bg-shape", viewBox 1440×634). */
const SWOOSH_PATH =
  "M-130.5 435.845C143.528 371.508 504.518 663.333 531.575 482.611C554.88 326.948 242.336 67.5472 157.825 217.22C58.9369 392.357 479.511 510.904 864.937 550";

type NavyBackdropProps = {
  /** Tinggi area navy di desktop (Figma: 634px untuk Activity / Venue detail). */
  height?: number;
  className?: string;
};

/**
 * Latar navy + garis lengkung indigo (motif brand) di belakang navbar & hero halaman dalam.
 * Path diberi data-anim="draw" → "tergambar" oleh GSAP DrawSVG saat halaman dibuka.
 */
export function NavyBackdrop({ height = 634, className }: NavyBackdropProps) {
  return (
    <div className={cx(styles.backdrop, className)} style={{ "--backdrop-h": `${height}px` } as CSSProperties} aria-hidden>
      <svg className={styles.swoosh} viewBox="0 0 1440 634" preserveAspectRatio="xMinYMid slice" fill="none">
        <path d={SWOOSH_PATH} stroke="currentColor" strokeWidth="38.1257" data-anim="draw" />
      </svg>
    </div>
  );
}
