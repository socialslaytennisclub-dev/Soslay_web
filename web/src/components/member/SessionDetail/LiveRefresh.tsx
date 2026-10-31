"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Jeda ambil ulang skor saat sesi live — cukup cepat untuk ronde ±15 menit, ringan untuk server. */
const INTERVAL_MS = 20_000;

/**
 * Selama sesi live, skor & ronde diinput host dari perangkat lain. Ambil ulang data server
 * (router.refresh) berkala selama halaman terlihat, supaya tab Live · Leaderboard · Ronde peserta
 * tidak tertinggal. Saat tab tersembunyi tidak ada request; begitu terlihat lagi RefreshOnFocus
 * (layout /akun) yang menyegarkan.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
