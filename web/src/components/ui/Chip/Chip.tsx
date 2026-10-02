import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Chip.module.css";

/**
 * Figma: Chip/Status, Chip/Period, Chip/Tier, Chip/Earned — pill 4/12, Inter Medium 14.
 * - lime    → Upcoming / Terdaftar (di foto) / tier
 * - indigo  → Terdaftar
 * - neutral → Selesai
 * - soft    → periode ("Bulan ini")
 * - white   → Selesai di atas foto
 * - navy    → poin ("+50 pts", "+120 minggu ini")
 */
export type ChipTone = "lime" | "indigo" | "neutral" | "soft" | "white" | "navy";

type ChipProps = {
  tone?: ChipTone;
  /** Poppins SemiBold (Chip/Tier) alih-alih Inter Medium. */
  strong?: boolean;
  className?: string;
  children: ReactNode;
};

export function Chip({ tone = "soft", strong, className, children }: ChipProps) {
  return <span className={cx(styles.chip, styles[tone], strong && styles.strong, className)}>{children}</span>;
}
