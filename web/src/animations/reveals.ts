import { gsap, SplitText } from "@/lib/gsap";

/**
 * Animasi scroll berbasis atribut. Komponen cukup menandai elemen:
 *
 *   data-anim="split"    → judul: baris naik dari balik mask
 *   data-anim="fade-up"  → elemen naik + fade
 *   data-anim="reveal"   → kartu foto: clip-path terbuka dari bawah, foto zoom-out
 *   data-anim="stagger"  → anak-anak langsung muncul berurutan (opsional data-anim-from="right")
 *   data-anim="draw"     → path SVG "tergambar" dari ujung ke ujung (DrawSVG), mis. swoosh brand
 *   data-parallax="-12"  → geser yPercent saat scroll (scrub). Desktop saja.
 *
 * Elemen [data-anim] disembunyikan via CSS sebelum JS jalan (lihat base.css) dan
 * dimunculkan oleh animasi ini, jadi tidak ada "flash" konten. Dengan reduced motion,
 * gate CSS tidak aktif dan fungsi-fungsi ini tidak dipanggil — konten tampil statis.
 */

// Mulai sedikit lebih awal supaya konten sudah muncul saat terlihat, tidak "menunggu".
const IN_VIEW = "top 90%";

function byAnim(scope: HTMLElement, name: string) {
  return gsap.utils.toArray<HTMLElement>(scope.querySelectorAll(`[data-anim='${name}']`));
}

export function splitReveal(scope: HTMLElement) {
  byAnim(scope, "split").forEach((el) => {
    gsap.set(el, { autoAlpha: 1 });
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 105,
          duration: 0.9,
          stagger: 0.07,
          scrollTrigger: { trigger: el, start: IN_VIEW },
        }),
    });
  });
}

export function fadeUp(scope: HTMLElement) {
  byAnim(scope, "fade-up").forEach((el) => {
    // `from` (bukan fromTo) → nilai akhir = opacity dari CSS (mis. teks muted 0.8).
    gsap.from(el, { autoAlpha: 0, y: 28, duration: 0.8, scrollTrigger: { trigger: el, start: IN_VIEW } });
  });
}

export function mediaReveal(scope: HTMLElement) {
  byAnim(scope, "reveal").forEach((el, i) => {
    const img = el.querySelector("img");
    const delay = Number(el.dataset.animDelay ?? 0) || (i % 2) * 0.12;
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%" }, delay });

    tl.fromTo(
      el,
      { autoAlpha: 1, clipPath: "inset(100% 0% 0% 0% round 12px)" },
      { clipPath: "inset(0% 0% 0% 0% round 12px)", duration: 1, ease: "expo.inOut", clearProps: "clipPath" },
    );
    if (img) {
      // Berakhir di skala CSS foto (mis. foto yang di-zoom untuk crop) supaya tidak "melompat".
      const base = Number(gsap.getProperty(img, "scale")) || 1;
      tl.fromTo(img, { scale: base * 1.2 }, { scale: base, duration: 1.3, clearProps: "transform" }, 0);
    }
  });
}

export function staggerChildren(scope: HTMLElement) {
  byAnim(scope, "stagger").forEach((el) => {
    const fromRight = el.dataset.animFrom === "right";
    gsap.set(el, { autoAlpha: 1 });
    gsap.from(el.children, {
      autoAlpha: 0,
      x: fromRight ? 120 : 0,
      y: fromRight ? 0 : 32,
      duration: 0.8,
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: IN_VIEW },
    });
  });
}

/** Parallax hanya di desktop (dipanggil dari matchMedia desktop). */
export function parallax(scope: HTMLElement) {
  gsap.utils.toArray<HTMLElement>(scope.querySelectorAll("[data-parallax]")).forEach((el) => {
    gsap.to(el, {
      yPercent: Number(el.dataset.parallax),
      ease: "none",
      scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
    });
  });
}

/** Wordmark raksasa di footer: huruf naik mengikuti scroll saat footer masuk layar. */
export function footerWordmark(scope: HTMLElement) {
  const el = scope.querySelector<HTMLElement>("[data-anim='wordmark']");
  if (!el) return;
  gsap.set(el, { autoAlpha: 1 });
  const split = SplitText.create(el, { type: "chars", mask: "chars" });
  gsap.from(split.chars, {
    yPercent: 100,
    ease: "none",
    stagger: 0.08,
    scrollTrigger: { trigger: el, start: "top 98%", end: "bottom 92%", scrub: 0.5 },
  });
}

/** Path SVG [data-anim='draw'] tergambar saat halaman dibuka (swoosh di NavyBackdrop). */
export function drawPaths(scope: HTMLElement) {
  byAnim(scope, "draw").forEach((path) => {
    gsap.set(path, { autoAlpha: 1 });
    gsap.from(path, { drawSVG: "0%", duration: 2.2, ease: "power3.inOut", delay: 0.2 });
  });
}
