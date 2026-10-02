"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// Registrasi plugin sekali saja, di sisi client.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother, SplitText, DrawSVGPlugin);
  gsap.defaults({ ease: "expo.out", duration: 1.2 });

  // Debug di DevTools (development saja): window.gsap, window.ScrollTrigger, window.ScrollSmoother
  if (process.env.NODE_ENV === "development") {
    Object.assign(window, { gsap, ScrollTrigger, ScrollSmoother });
  }
}

/** Media query untuk gsap.matchMedia — animasi hanya jalan jika pengguna tidak minta reduced motion. */
export const MOTION = {
  ok: "(prefers-reduced-motion: no-preference)",
  desktop: "(prefers-reduced-motion: no-preference) and (min-width: 1200px)",
  finePointer: "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
} as const;

export { DrawSVGPlugin, gsap, ScrollSmoother, ScrollTrigger, SplitText, useGSAP };
