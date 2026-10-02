import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  value: number;
  max: number;
  /** Teks untuk screen reader, mis. "Target bulanan". */
  label: string;
  /** indigo: di kartu putih · navy: di kartu lime (Slay Point). */
  tone?: "indigo" | "navy";
  className?: string;
};

/** Figma: progress/track 8px + progress/fill, radius penuh. */
export function ProgressBar({ value, max, label, tone = "indigo", className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  return (
    <div
      className={cx(styles.track, styles[tone], className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ "--progress": ratio } as CSSProperties}
    >
      <span className={styles.fill} />
    </div>
  );
}
