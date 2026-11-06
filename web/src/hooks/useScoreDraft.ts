"use client";

import { useState } from "react";
import { SCORE_MAX } from "@/lib/americano";

/**
 * Draf skor satu match untuk input host / admin. Dengan target (Americano) cukup atur salah satu tim:
 * tim lawan = target − skor itu, jadi total selalu tepat target. Tanpa target (Rotating Partner) kedua
 * skor bebas, asal bukan 0–0 (aturan sama dengan SQL save_match_score).
 */
export function useScoreDraft(target: number | null, initialA: number | null = null, initialB: number | null = null) {
  const startA = (a: number | null) => a ?? (target === null ? 0 : Math.ceil(target / 2));
  const [a, setRawA] = useState(() => startA(initialA));
  const [freeB, setFreeB] = useState(initialB ?? 0);
  const max = target ?? SCORE_MAX;
  const clamp = (n: number) => Math.max(0, Math.min(max, Number.isFinite(n) ? Math.round(n) : 0));
  const b = target === null ? freeB : target - a;
  return {
    a,
    b,
    max,
    valid: a + b > 0,
    setA: (n: number) => setRawA(clamp(n)),
    setB: (n: number) => (target === null ? setFreeB(clamp(n)) : setRawA(target - clamp(n))),
    /** Mulai lagi dari skor match lain (null = belum berskor). */
    reset: (nextA: number | null, nextB: number | null) => {
      setRawA(startA(nextA));
      setFreeB(nextB ?? 0);
    },
  };
}
