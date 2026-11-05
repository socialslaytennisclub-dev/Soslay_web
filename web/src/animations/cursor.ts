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

  // Label yang sedang tampil (null = titik kecil). Ditentukan dari elemen di bawah kursor setiap gerakan —
  // bukan dari pasangan pointerover/out — supaya tidak tertinggal membesar saat elemennya hilang (pindah
  // halaman) dan tidak ada sisa label ("Vi") saat keluar sebelum animasi masuk selesai.
  let active: string | null = null;
  const expand = (text: string) => {
    active = text;
    if (label) {
      gsap.killTweensOf(label);
      label.textContent = text;
      gsap.to(label, { autoAlpha: 1, duration: 0.25, delay: 0.1 });
    }
    gsap.to(cursor, { width: EXPANDED, height: EXPANDED, duration: 0.5, ease: "expo.out", overwrite: "auto" });
  };
  const collapse = () => {
    active = null;
    if (label) {
      gsap.killTweensOf(label);
      gsap.set(label, { autoAlpha: 0 });
      label.textContent = "";
    }
    gsap.to(cursor, { width: DOT, height: DOT, duration: 0.5, ease: "expo.out", overwrite: "auto" });
  };
  const sync = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>("[data-cursor]") : null;
    const want = el && scope.contains(el) ? (el.dataset.cursor ?? "") || null : null;
    if (want === active) return;
    if (want) expand(want);
    else collapse();
  };

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
    sync(event.target);
  };
  const onEnterPage = () => gsap.to(cursor, { scale: 1, duration: 0.4 });
  const onLeavePage = () => {
    collapse();
    gsap.to(cursor, { scale: 0, duration: 0.3 });
  };
  // Scroll tanpa menggerakkan mouse juga bisa memindahkan elemen di bawah kursor.
  let last: { x: number; y: number } | null = null;
  const trackLast = (event: PointerEvent) => void (last = { x: event.clientX, y: event.clientY });
  const onScroll = () => last && sync(document.elementFromPoint(last.x, last.y));

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointermove", trackLast, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.documentElement.addEventListener("pointerenter", onEnterPage);
  document.documentElement.addEventListener("pointerleave", onLeavePage);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointermove", trackLast);
    window.removeEventListener("scroll", onScroll);
    document.documentElement.removeEventListener("pointerenter", onEnterPage);
    document.documentElement.removeEventListener("pointerleave", onLeavePage);
    gsap.killTweensOf([cursor, label]);
  };
}
