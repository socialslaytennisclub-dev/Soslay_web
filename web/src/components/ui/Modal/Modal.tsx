"use client";

import type { MouseEvent, ReactNode, RefObject } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Modal.module.css";

type ModalProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  onClose: () => void;
  onBackdropClick: (event: MouseEvent<HTMLDialogElement>) => void;
  children: ReactNode;
};

/** Modal sederhana di atas <dialog> native. Pakai bersama hook useDialog(). */
export function Modal({ dialogRef, title, onClose, onBackdropClick, children }: ModalProps) {
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label={title} onClick={onBackdropClick}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Tutup">
            <Icon name="close" size={24} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
