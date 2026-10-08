import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Marquee "PLAY. CONNECT. REPEAT." yang bereaksi pada scroll:
 * makin cepat scroll → makin cepat & sedikit miring; scroll ke atas → arah berbalik.
 * Hover → berhenti pelan.
 */
export function velocityMarquee(scope: HTMLElement) {
  const cleanups: Array<() => void> = [];

  scope.querySelectorAll<HTMLElement>("[data-marquee]").forEach((marquee) => {
    const tracks = gsap.utils.toArray<HTMLElement>(marquee.querySelectorAll("[data-marquee-track]"));
    if (!tracks.length) return;

    const gap = parseFloat(getComputedStyle(marquee).columnGap) || 0;
    const loop = gsap.to(tracks, {
      x: (_, target: HTMLElement) => -(target.offsetWidth + gap),
      duration: Number(marquee.dataset.marqueeDuration ?? 28),
      ease: "none",
      repeat: -1,
    });
    // Mulai jauh dari 0 supaya timeScale negatif (arah balik) tetap berjalan.
    loop.totalTime(loop.duration() * 1000);

    const skew = gsap.quickTo(tracks, "skewX", { duration: 0.4, ease: "power3" });
    let direction = 1;
    let hovering = false;
    let settle: gsap.core.Tween | undefined;

    // Lebar track berubah saat resize → hitung ulang jarak loop.
    const onRefresh = () => loop.invalidate();
    ScrollTrigger.addEventListener("refresh", onRefresh);

    ScrollTrigger.create({
      trigger: marquee,
      start: "top bottom",
      end: "bottom top",
      // Di luar layar loop dihentikan — tidak ada kerja tiap frame untuk elemen yang tak terlihat.
      onToggle: (self) => loop.paused(!self.isActive),
      onRefresh: (self) => loop.paused(!self.isActive),
      onUpdate(self) {
        if (hovering) return;
        direction = self.direction;
        const velocity = self.getVelocity();
        const boost = gsap.utils.clamp(1, 6, 1 + Math.abs(velocity) / 400);
        gsap.to(loop, { timeScale: direction * boost, duration: 0.2, overwrite: true });
        skew(gsap.utils.clamp(-10, 10, velocity / -250));

        settle?.kill();
        settle = gsap.delayedCall(0.15, () => {
          gsap.to(loop, { timeScale: direction, duration: 1.2, overwrite: true });
          skew(0);
        });
      },
    });

    const onEnter = () => {
      hovering = true;
      gsap.to(loop, { timeScale: 0, duration: 0.6, overwrite: true });
    };
    const onLeave = () => {
      hovering = false;
      gsap.to(loop, { timeScale: direction, duration: 0.6, overwrite: true });
    };
    marquee.addEventListener("mouseenter", onEnter);
    marquee.addEventListener("mouseleave", onLeave);
    cleanups.push(() => {
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      marquee.removeEventListener("mouseenter", onEnter);
      marquee.removeEventListener("mouseleave", onLeave);
    });
  });

  return () => cleanups.forEach((fn) => fn());
}
