"use client";

import { useRef, type ReactNode } from "react";
import {
  customCursor,
  drawPaths,
  fadeUp,
  footerWordmark,
  heroIntro,
  magneticButtons,
  mediaReveal,
  parallax,
  splitReveal,
  staggerChildren,
} from "@/animations";
import { gsap, MOTION, ScrollSmoother, useGSAP } from "@/lib/gsap";
import styles from "./MotionProvider.module.css";

type MotionProviderProps = {
  children: ReactNode;
};

/**
 * Navigasi lewat tombol Back/Forward → posisi scroll dipulihkan; navigasi biasa → halaman baru
 * mulai dari atas. Tanpa ini ScrollSmoother mewarisi scroll halaman sebelumnya (mis. dari chip
 * filter di /activity ke /activity/mabar langsung jatuh di tengah, hero terlewat).
 */
let fromHistory = false;
if (typeof window !== "undefined") window.addEventListener("popstate", () => (fromHistory = true));

/**
 * Membungkus konten halaman (di bawah Navbar) dengan:
 * - ScrollSmoother (smooth scroll ala Awwwards, desktop saja — touch tetap native)
 * - semua animasi GSAP berbasis atribut data-anim (lihat src/animations)
 * - kursor custom
 * Semua dibersihkan otomatis oleh gsap.matchMedia/useGSAP saat unmount atau media query berubah.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = contentRef.current;
      if (!scope) return;
      if (!fromHistory && !window.location.hash) window.scrollTo(0, 0);
      fromHistory = false;
      const mm = gsap.matchMedia();

      // ScrollSmoother harus dibuat SEBELUM ScrollTrigger lain.
      mm.add(MOTION.finePointer, () => {
        const smoother = ScrollSmoother.create({
          wrapper: wrapperRef.current!,
          content: scope,
          smooth: 0.7, // lebih responsif — 1.1 terasa "berat" mengikuti scroll
          effects: false,
        });
        const stopMagnetic = magneticButtons(document.body);
        const stopCursor = cursorRef.current ? customCursor(cursorRef.current, document.body) : undefined;
        return () => {
          stopMagnetic();
          stopCursor?.();
          smoother.kill();
        };
      });

      mm.add(MOTION.ok, () => {
        heroIntro(scope);
        drawPaths(scope);
        splitReveal(scope);
        fadeUp(scope);
        mediaReveal(scope);
        staggerChildren(scope);
        footerWordmark(scope);
      });

      mm.add(MOTION.desktop, () => {
        parallax(scope);
      });
    },
    { scope: wrapperRef },
  );

  return (
    <>
      <div ref={wrapperRef} className={styles.wrapper}>
        <div ref={contentRef}>{children}</div>
      </div>
      <div ref={cursorRef} className={styles.cursor} aria-hidden>
        <span data-cursor-label className={styles.cursorLabel} />
      </div>
    </>
  );
}
