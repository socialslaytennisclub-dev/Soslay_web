"use client";

import type { MouseEvent, ReactNode, RefObject } from "react";
import { cx } from "@/lib/cx";
import { AdminIcon } from "./AdminIcon";
import styles from "./Drawer.module.css";

type DrawerProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBackdropClick: (event: MouseEvent<HTMLDialogElement>) => void;
  /** Tombol aksi yang menempel di bawah panel (mis. Batal / Simpan). */
  footer?: ReactNode;
  /** "wide" untuk isi bertabel (mis. preview impor peserta). */
  size?: "default" | "wide";
  children: ReactNode;
};

/**
 * Panel samping admin yang mengambang di kanan (jarak 16px dari tepi) dan meluncur masuk. Dibangun di atas <dialog> native
 * (fokus terkunci, Esc, klik latar untuk menutup) — pakai bersama hook useDialog().
 */
export function Drawer({ dialogRef, title, subtitle, onClose, onBackdropClick, footer, size = "default", children }: DrawerProps) {
  return (
    <dialog ref={dialogRef} className={cx(styles.drawer, size === "wide" && styles.wide)} aria-label={title} onClick={onBackdropClick}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Tutup">
            <AdminIcon name="x" size={20} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
