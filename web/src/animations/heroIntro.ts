import { gsap, SplitText } from "@/lib/gsap";

/**
 * Intro hero saat halaman dibuka:
 * 1. foto zoom-out pelan, 2. huruf "SOSLAY" naik satu per satu dari balik mask,
 * 3. baris deskripsi & tombol menyusul. Setelah itu wordmark & foto ber-parallax saat scroll.
 */
export function heroIntro(scope: HTMLElement) {
  const hero = scope.querySelector<HTMLElement>("[data-anim='hero']");
  if (!hero) return;

  const media = hero.querySelector<HTMLElement>("[data-hero-media]");
  const wordmark = hero.querySelector<HTMLElement>("[data-hero-wordmark]");
  const lines = hero.querySelector<HTMLElement>("[data-hero-lines]");
  const cta = hero.querySelector<HTMLElement>("[data-hero-cta]");

  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  tl.set(hero, { autoAlpha: 1 }, 0);

  if (media) tl.fromTo(media, { scale: 1.25 }, { scale: 1, duration: 2.4 }, 0);

  if (wordmark) {
    const split = SplitText.create(wordmark, { type: "chars", mask: "chars", charsClass: "char" });
    wordmark.dataset.split = "true";
    tl.set(wordmark, { autoAlpha: 1 }, 0).from(
      split.chars,
      { yPercent: 110, rotate: 8, duration: 1.5, stagger: 0.06 },
      0.15,
    );
  }

  if (lines) {
    tl.set(lines, { autoAlpha: 1 }, 0);
    SplitText.create(lines, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      // Jangan return tween di sini: autoSplit akan me-revert timeline intro saat resize.
      onSplit: (self) => {
        tl.from(self.lines, { yPercent: 100, duration: 1.1, stagger: 0.08 }, 0.7);
      },
    });
  }

  if (cta) tl.fromTo(cta, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1 }, 1.05);

  // Parallax saat scroll keluar dari hero
  const scrollOut = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
  // fromTo + nilai awal eksplisit: kalau pakai `to`, nilai awal direkam saat tween pertama render
  // (bisa di tengah intro) → saat scroll balik ke atas wordmark tertinggal transparan.
  if (media) {
    gsap.fromTo(media, { yPercent: 0 }, { yPercent: 18, ease: "none", immediateRender: false, scrollTrigger: scrollOut });
  }
  if (wordmark) {
    gsap.fromTo(
      wordmark,
      { yPercent: 0, opacity: 1 },
      { yPercent: -35, opacity: 0.2, ease: "none", immediateRender: false, scrollTrigger: scrollOut },
    );
  }
}
