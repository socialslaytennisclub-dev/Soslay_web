"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * State & perilaku lightbox galeri:
 * - buka/tutup memakai <dialog> native (fokus terkunci, Esc, top layer di atas navbar)
 * - navigasi ← / → (keyboard & tombol), berputar dari akhir ke awal
 * - scroll halaman dikunci selama terbuka
 */
export function useLightbox(count: number) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const isOpen = index !== null;

  const open = useCallback((i: number) => setIndex(i), []);
  const close = useCallback(() => setIndex(null), []);
  const next = useCallback(() => setIndex((i) => (i === null ? i : (i + 1) % count)), [count]);
  const prev = useCallback(() => setIndex((i) => (i === null ? i : (i - 1 + count) % count)), [count]);

  // Sinkronkan state → <dialog>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Esc (event "cancel" bawaan dialog) & panah kiri/kanan
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close, next, prev]);

  // Kunci scroll halaman
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isOpen]);

  /** Klik di backdrop (di luar kartu) menutup lightbox. */
  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) close();
    },
    [close],
  );

  return { dialogRef, index, isOpen, open, close, next, prev, onBackdropClick };
}
