"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Waktu router.refresh terakhir lewat hook ini — dibagi semua pemanggil di tab yang sama. */
let lastRefreshAt = Date.now();

/** Milidetik sejak refresh data server terakhir (RefreshOnFocus / LiveRefresh). */
export const sinceServerRefresh = () => Date.now() - lastRefreshAt;

/**
 * router.refresh yang mencatat waktunya, supaya refresh saat tab dibuka lagi dan polling sesi
 * live tidak menembak dua kali berturut-turut.
 */
export function useServerRefresh() {
  const router = useRouter();
  return useCallback(() => {
    lastRefreshAt = Date.now();
    router.refresh();
  }, [router]);
}
