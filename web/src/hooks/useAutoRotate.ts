"use client";

import { useCallback, useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Index yang berputar otomatis setiap `intervalMs` (untuk carousel/slider).
 * Berhenti saat `paused`, dan tidak berjalan jika pengguna memilih reduced motion.
 */
export function useAutoRotate(count: number, intervalMs = 5000) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || count < 2 || prefersReducedMotion()) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, count, intervalMs]);

  const goTo = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return { index, goTo, pause, resume, paused };
}
