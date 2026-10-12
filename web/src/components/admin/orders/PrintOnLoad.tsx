"use client";

import { useEffect } from "react";

/** Buka dialog cetak begitu halaman label selesai dimuat. */
export function PrintOnLoad() {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
