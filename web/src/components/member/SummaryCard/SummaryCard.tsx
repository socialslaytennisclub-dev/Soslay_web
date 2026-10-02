import type { ReactNode } from "react";
import { ProgressBar } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./SummaryCard.module.css";

type SummaryCardProps = {
  title: string;
  /** Chip di kanan judul. */
  badge?: ReactNode;
  /** Angka besar (Heading/48) + satuan. */
  value: string;
  unit: string;
  tone?: "white" | "lime";
  children: ReactNode;
};

/** Kerangka kartu ringkasan dashboard (Slay Activity putih, Slay Point lime) — Figma 424×280, padding 24. */
export function SummaryCard({ title, badge, value, unit, tone = "white", children }: SummaryCardProps) {
  return (
    <article className={cx(styles.card, styles[tone])}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {badge}
      </header>
      <p className={styles.headline}>
        <span className={styles.value}>{value}</span>
        <span className={styles.unit}>{unit}</span>
      </p>
      {children}
    </article>
  );
}

type SummaryProgressProps = {
  label: string;
  /** Teks kanan, mis. "12/16 sesi". */
  valueLabel: string;
  value: number;
  max: number;
  tone?: "indigo" | "navy";
};

/** Label + angka di atas progress bar ("Target bulanan · 12/16 sesi"). */
export function SummaryProgress({ label, valueLabel, value, max, tone }: SummaryProgressProps) {
  return (
    <div className={styles.progress}>
      <p className={styles.progressLabel}>
        <span>{label}</span>
        <span className={styles.progressValue}>{valueLabel}</span>
      </p>
      <ProgressBar value={value} max={max} label={label} tone={tone} />
    </div>
  );
}
