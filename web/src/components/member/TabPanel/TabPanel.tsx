import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./TabPanel.module.css";

type TabPanelProps = {
  /** Judul tab untuk screen reader (header member sudah punya h1). */
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * Isi satu tab member. Animasi masuk pakai CSS (bukan data-anim GSAP) karena layout /akun
 * tetap ter-mount saat pindah tab — MotionProvider tidak memindai ulang konten baru.
 */
export function TabPanel({ label, className, children }: TabPanelProps) {
  return (
    <section className={styles.section} aria-label={label}>
      <Container className={cx(styles.panel, className)}>{children}</Container>
    </section>
  );
}
