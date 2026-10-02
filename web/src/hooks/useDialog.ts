"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * Buka/tutup <dialog> native (fokus terkunci, Esc, top layer) + kunci scroll halaman.
 * Untuk modal sederhana (panduan ukuran, konfirmasi, dsb.).
 */
export function useDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", onCancel);
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      document.documentElement.style.overflow = previous;
    };
  }, [isOpen, close]);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) close();
    },
    [close],
  );

  return { dialogRef, isOpen, open, close, onBackdropClick };
}
