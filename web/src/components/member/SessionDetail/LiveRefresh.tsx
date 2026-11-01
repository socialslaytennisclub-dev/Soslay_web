"use client";

import { useEffect } from "react";
import { sinceServerRefresh, useServerRefresh } from "@/hooks/useServerRefresh";

/** Jeda ambil ulang skor saat sesi berjalan — cukup cepat untuk ronde ±15 menit, ringan untuk server. */
const INTERVAL_MS = 20_000;
/** Seberapa sering jeda di atas dicek (refresh dari RefreshOnFocus ikut menggeser jadwal). */
const TICK_MS = 5_000;
/** Batas setTimeout browser (±24,8 hari); sesi yang lebih jauh tidak dijadwalkan. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Selama sesi berjalan, check-in, ronde & skor diubah host dari perangkat lain. Mulai `from`
 * (check-in dibuka — host bisa memulai activity lebih awal), ambil ulang data server berkala
 * selama halaman terlihat, supaya tab Live · Leaderboard · Ronde peserta tidak tertinggal.
 * Halaman yang dibuka sebelum `from` menunggu sampai waktunya lalu langsung menyegarkan.
 * Polling berhenti sendiri saat sesi selesai (komponen tidak dirender untuk fase done).
 */
export function LiveRefresh({ from }: { from: string }) {
  const refresh = useServerRefresh();

  useEffect(() => {
    let tick: number | undefined;
    const poll = () => {
      tick = window.setInterval(() => {
        if (document.visibilityState === "visible" && sinceServerRefresh() >= INTERVAL_MS) refresh();
      }, TICK_MS);
    };
    const wait = new Date(from).getTime() - Date.now();
    if (wait <= 0) {
      poll();
      return () => window.clearInterval(tick);
    }
    if (wait > MAX_TIMEOUT_MS) return;
    const start = window.setTimeout(() => {
      refresh();
      poll();
    }, wait);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(tick);
    };
  }, [from, refresh]);

  return null;
}
