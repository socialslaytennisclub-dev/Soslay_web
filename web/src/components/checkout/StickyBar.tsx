"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import styles from "./Checkout.module.css";

const noopSubscribe = () => () => {};

/**
 * Bar bawah sticky (MOB-05): total + tombol utama di HP. Konten halaman dibungkus smooth-scroll GSAP
 * (wrapper ber-transform), jadi position: fixed di dalamnya ikut bergulir → versi HP dirender lewat
 * portal ke <body>. Di desktop (≥1200) tombol tampil di tempat (inline), portal disembunyikan CSS.
 */
export function StickyBar({ total, children, className }: { total?: ReactNode; children: ReactNode; className?: string }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <>
      <div className={cx(styles.stickyInline, className)}>{children}</div>
      {mounted &&
        createPortal(
          <div className={styles.stickyBar}>
            {total && <span className={styles.stickyTotal}>{total}</span>}
            <div className={total ? styles.ctaSlot : styles.stickyButtons}>{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
