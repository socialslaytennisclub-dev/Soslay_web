import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Guide.module.css";

type SectionLabelProps = {
  /** navy: pill navy + teks lime (di latar terang) · lime: pill lime + teks navy (di latar navy). */
  tone?: "navy" | "lime";
  className?: string;
  children: ReactNode;
};

/** Figma: eyebrow Participant Guide — pill, Poppins Bold 13 caps, tracking 6%. */
export function SectionLabel({ tone = "navy", className, children }: SectionLabelProps) {
  return <p className={cx(styles.label, styles[`label-${tone}`], className)}>{children}</p>;
}
