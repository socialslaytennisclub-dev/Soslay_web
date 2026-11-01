"use client";

import { useEffect } from "react";
import { sinceServerRefresh, useServerRefresh } from "@/hooks/useServerRefresh";

/** Jeda minimal antar refresh supaya bolak-balik tab tidak membanjiri server. */
const MIN_INTERVAL_MS = 15_000;

/**
 * Data member (jadwal sesi, peserta, skor) bisa diubah admin di tab lain. Saat tab member
 * dibuka lagi, ambil ulang data server (router.refresh) supaya tidak menampilkan jadwal lama.
 */
export function RefreshOnFocus() {
  const refresh = useServerRefresh();

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || sinceServerRefresh() < MIN_INTERVAL_MS) return;
      refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return null;
}
