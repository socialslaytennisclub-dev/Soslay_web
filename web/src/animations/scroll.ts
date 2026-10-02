import { ScrollSmoother } from "@/lib/gsap";

/** Scroll halus ke elemen — lewat ScrollSmoother bila aktif, selain itu scroll native. */
export function scrollToElement(el: HTMLElement, offset = 96) {
  const smoother = ScrollSmoother.get();
  if (smoother) {
    smoother.scrollTo(el, true, `top ${offset}px`);
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: reduce ? "auto" : "smooth" });
}
