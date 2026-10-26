"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Jeda minimal antar refresh supaya bolak-balik tab tidak membanjiri server. */
const MIN_INTERVAL_MS = 15_000;

/**
 * Data member (jadwal sesi, peserta, skor) bisa diubah admin di tab lain. Saat tab member
 * dibuka lagi, ambil ulang data server (router.refresh) supaya tidak menampilkan jadwal lama.
 */
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_INTERVAL_MS) return;
      last = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return null;
}
