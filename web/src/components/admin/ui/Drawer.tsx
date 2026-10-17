"use client";

import type { MouseEvent, ReactNode, RefObject } from "react";
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
  children: ReactNode;
};

/**
 * Panel samping admin yang meluncur dari kiri, setinggi layar. Dibangun di atas <dialog> native
 * (fokus terkunci, Esc, klik latar untuk menutup) — pakai bersama hook useDialog().
 */
export function Drawer({ dialogRef, title, subtitle, onClose, onBackdropClick, footer, children }: DrawerProps) {
  return (
    <dialog ref={dialogRef} className={styles.drawer} aria-label={title} onClick={onBackdropClick}>
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
