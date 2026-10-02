"use client";

import { useCallback, useEffect, useState } from "react";

type Options = {
  /** Tutup otomatis saat tombol Escape ditekan. */
  closeOnEscape?: boolean;
  /** Kunci scroll body selama terbuka (untuk menu fullscreen / modal). */
  lockScroll?: boolean;
};

/** State buka/tutup untuk menu, dropdown, dan modal. */
export function useDisclosure({ closeOnEscape = true, lockScroll = false }: Options = {}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeOnEscape]);

  useEffect(() => {
    if (!isOpen || !lockScroll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, lockScroll]);

  return { isOpen, open, close, toggle };
}
