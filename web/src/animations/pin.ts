import { ScrollSmoother, ScrollTrigger } from "@/lib/gsap";

/**
 * Pengganti `position: sticky` (tidak jalan di dalam ScrollSmoother karena konten di-transform).
 * Elemen menempel `offset` px dari atas selama `container` masih terlihat.
 */
export function pinWithin(el: HTMLElement, container: HTMLElement, offset = 96): () => void {
  const trigger = ScrollTrigger.create({
    trigger: el,
    start: `top top+=${offset}`,
    endTrigger: container,
    end: () => `bottom top+=${offset + el.offsetHeight}`,
    pin: true,
    pinSpacing: false,
    pinType: ScrollSmoother.get() ? "transform" : "fixed",
    invalidateOnRefresh: true,
  });
  return () => trigger.kill();
}
