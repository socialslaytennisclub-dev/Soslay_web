import { gsap } from "@/lib/gsap";

/**
 * Kursor custom: titik lime yang mengikuti mouse dengan sedikit lag.
 * Di atas elemen [data-cursor="Label"] titik membesar dan menampilkan label (mis. "Lihat").
 */
export function customCursor(cursor: HTMLElement, scope: HTMLElement) {
  const label = cursor.querySelector<HTMLElement>("[data-cursor-label]");
  const xTo = gsap.quickTo(cursor, "x", { duration: 0.5, ease: "power3" });
  const yTo = gsap.quickTo(cursor, "y", { duration: 0.5, ease: "power3" });

  // Ukuran dianimasikan lewat width/height (bukan scale) supaya label tetap tajam.
  const DOT = 14;
  const EXPANDED = 88;
  gsap.set(cursor, { xPercent: -50, yPercent: -50, scale: 0, autoAlpha: 1 });

  let visible = false;
  const onMove = (event: PointerEvent) => {
    if (!visible) {
      // Gerakan pertama: lompat langsung ke posisi kursor, lalu munculkan.
      gsap.set(cursor, { x: event.clientX, y: event.clientY });
      gsap.to(cursor, { scale: 1, duration: 0.4 });
      visible = true;
    }
    xTo(event.clientX);
    yTo(event.clientY);
  };
  const onEnterPage = () => gsap.to(cursor, { scale: 1, duration: 0.4 });
  const onLeavePage = () => gsap.to(cursor, { scale: 0, duration: 0.3 });

  const onOver = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cursor]");
    if (target && label) {
      label.textContent = target.dataset.cursor ?? "";
      gsap.to(cursor, { width: EXPANDED, height: EXPANDED, duration: 0.5, ease: "expo.out" });
      gsap.to(label, { autoAlpha: 1, duration: 0.3, delay: 0.1 });
    }
  };
  const onOut = (event: Event) => {
    const from = (event.target as HTMLElement).closest("[data-cursor]");
    const to = ((event as MouseEvent).relatedTarget as HTMLElement | null)?.closest("[data-cursor]");
    if (from && from !== to) {
      gsap.to(cursor, { width: DOT, height: DOT, duration: 0.5, ease: "expo.out" });
      if (label) gsap.to(label, { autoAlpha: 0, duration: 0.15 });
    }
  };

  window.addEventListener("pointermove", onMove);
  document.documentElement.addEventListener("pointerenter", onEnterPage);
  document.documentElement.addEventListener("pointerleave", onLeavePage);
  scope.addEventListener("pointerover", onOver);
  scope.addEventListener("pointerout", onOut);

  return () => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerenter", onEnterPage);
    document.documentElement.removeEventListener("pointerleave", onLeavePage);
    scope.removeEventListener("pointerover", onOver);
    scope.removeEventListener("pointerout", onOut);
  };
}
