"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { cx } from "@/lib/cx";
import styles from "./Finance.module.css";

type FinanceModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  /** Isi bilah bawah (mis. catatan kiri + tombol kanan). */
  footer?: ReactNode;
  /** Bila diisi, isi modal dibungkus <form action> (Enter = submit). */
  action?: (formData: FormData) => void;
  formRef?: Ref<HTMLFormElement>;
  children: ReactNode;
};

/**
 * Modal tengah modul Keuangan (Figma 12c, 12l, 12n, 12o, 12q, 13h) di atas <dialog> native:
 * fokus terkunci, Esc & klik latar menutup, scroll halaman dikunci selama terbuka.
 */
export function FinanceModal({ open, onClose, title, subtitle, wide, footer, action, formRef, children }: FinanceModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  const inner = (
    <>
      <div className={styles.modalHead}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle && <p className={styles.panelSub}>{subtitle}</p>}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Tutup">
          <AdminIcon name="x" size={18} />
        </button>
      </div>
      <div className={styles.modalBody}>{children}</div>
      {footer && <div className={styles.modalFoot}>{footer}</div>}
    </>
  );

  return (
    <dialog ref={ref} className={cx(styles.modal, wide && styles.modalWide)} aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {action ? (
        <form ref={formRef} action={action} className={styles.modalInner} noValidate>
          {inner}
        </form>
      ) : (
        <div className={styles.modalInner}>{inner}</div>
      )}
    </dialog>
  );
}
