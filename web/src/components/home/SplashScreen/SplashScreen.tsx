"use client";

import { useRef, useState } from "react";
import { splash } from "@/content/home";
import { gsap, useGSAP } from "@/lib/gsap";
import { openIntroGate } from "@/lib/intro-gate";
import styles from "./SplashScreen.module.css";

/**
 * Splash homepage (±3,2 detik, tiap kali homepage dibuka / di-refresh): bola tenis memantul
 * melintasi layar dan tiap pantulan "memukul" satu huruf SOSLAY naik. Setelah huruf terakhir,
 * bola di-smash ke arah layar sampai layar jadi lime, lalu memudar membuka homepage (intro hero).
 *
 * Tampil hanya bila <html data-splash> dipasang SPLASH_SCRIPT (root layout) sebelum paint — jadi
 * homepage tidak berkedip dulu. Navigasi di dalam situs kembali ke "/" tidak memutarnya lagi.
 */

const CHARS = splash.word.split("");
/** Durasi satu lompatan bola antar huruf (detik). */
const HOP = 0.27;
/** Ukuran lingkaran lime penutup layar di CSS (px) — diskalakan, bukan bolanya (tetap ringan). */
const FLASH = 100;

/**
 * StrictMode (dev) menjalankan efek dua kali; cleanup pertama tidak boleh langsung membuka gerbang
 * intro (splash kedua tidak akan jalan). Penutupan ditunda sebentar dan dibatalkan bila efek jalan lagi.
 */
let pendingFinish: number | undefined;

export function SplashScreen() {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  useGSAP(
    (_context, contextSafe) => {
      window.clearTimeout(pendingFinish);
      const el = root.current;
      if (!el || !document.documentElement.hasAttribute("data-splash")) {
        setDone(true);
        return;
      }
      // Overlay tetap tampil sampai timeline selesai, walau <html data-splash> sudah dilepas.
      el.dataset.active = "";
      let tl: gsap.core.Timeline | undefined;
      let cancelled = false;

      const build = contextSafe!(() => {
        const q = gsap.utils.selector(el);
        const [ball] = q("[data-ball]");
        const [sprite] = q("[data-sprite]");
        const chars = q("[data-char]");
        const box = el.getBoundingClientRect();
        const size = ball.getBoundingClientRect().width;
        // Semua huruf satu baris: "lantai" = sisi atas mask huruf (hurufnya masih tergeser ke bawah).
        const masks = chars.map((c) => c.parentElement!.getBoundingClientRect());
        const xs = masks.map((r) => r.left + r.width / 2 - box.left - size / 2);
        const floor = masks[0].top - box.top - size * 0.9;
        const lift = Math.max(size * 2.2, box.height * 0.16);

        tl = gsap.timeline({ onComplete: () => setDone(true) });
        /** Lompatan melengkung: x bergerak, y naik ke puncak lalu jatuh ke `y`. */
        const arc = (x: number, peak: number, y: number, duration: number, at: number, xEase = "none") =>
          tl!
            .to(ball, { x, duration, ease: xEase }, at)
            .to(ball, { keyframes: [{ y: peak, ease: "power2.out" }, { y, ease: "power2.in" }], duration }, at);

        tl.set(ball, { x: -size * 2, y: floor - lift * 1.4, autoAlpha: 1 }, 0);
        xs.forEach((x, i) => {
          const at = 0.15 + i * HOP;
          arc(x, floor - lift, floor, HOP, at)
            .to(sprite, { rotate: "+=120", duration: HOP, ease: "none" }, at)
            // Mendarat: bola gepeng, huruf terpukul naik.
            .to(sprite, { scaleX: 1.25, scaleY: 0.75, duration: 0.06, ease: "power2.out", yoyo: true, repeat: 1 }, at + HOP)
            .fromTo(chars[i], { autoAlpha: 1, yPercent: 110, rotate: i % 2 ? -10 : 10 }, { yPercent: 0, rotate: 0, duration: 0.55, ease: "back.out(2.2)" }, at + HOP - 0.04);
        });

        // Smash: bola melambung ke tengah, membesar, lalu lingkaran lime menutup layar dan memudar.
        const end = 0.15 + xs.length * HOP;
        const smash = end + 0.5;
        arc(box.width / 2 - size / 2, floor - lift * 1.6, box.height / 2 - size / 2, 0.45, end + 0.05, "power2.inOut");
        tl.fromTo(q("[data-motto]"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out" }, end - 0.05)
          .to(chars, { yPercent: -18, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1, stagger: 0.025 }, smash)
          .to(sprite, { scale: 3, rotate: "+=120", duration: 0.25, ease: "power2.in" }, smash)
          .fromTo(
            q("[data-flash]"),
            { autoAlpha: 1, scale: (size * 3) / FLASH },
            { scale: (Math.hypot(box.width, box.height) / FLASH) * 1.05, duration: 0.3, ease: "power2.in", immediateRender: false },
            smash + 0.22,
          )
          .call(openIntroGate, [], smash + 0.45)
          .to(el, { autoAlpha: 0, duration: 0.4, ease: "power1.out" }, smash + 0.5);
      });

      // Titik pendaratan diukur setelah font judul siap (maks. 800 ms, supaya tidak menunggu font lain).
      const [word] = el.querySelectorAll("[data-word]");
      Promise.race([
        document.fonts.load(`800 1em ${getComputedStyle(word).fontFamily}`),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]).then(() => {
        if (!cancelled) build();
      });

      const skip = contextSafe!(() => {
        if (tl && tl.progress() < 0.75) tl.progress(0.75);
      });
      el.addEventListener("click", skip);
      window.addEventListener("keydown", skip);
      return () => {
        cancelled = true;
        el.removeEventListener("click", skip);
        window.removeEventListener("keydown", skip);
        pendingFinish = window.setTimeout(openIntroGate, 0);
      };
    },
    { scope: root },
  );

  if (done) return null;

  return (
    <div ref={root} className={styles.splash} aria-hidden="true">
      <div className={styles.stage}>
        <span className={styles.word} data-word>
          {CHARS.map((char, i) => (
            <span key={i} className={styles.charMask}>
              <span className={styles.char} data-char>
                {char}
              </span>
            </span>
          ))}
        </span>
        <span className={styles.motto} data-motto>
          {splash.motto}
        </span>
      </div>
      <span className={styles.ball} data-ball>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG kecil statis, tidak perlu optimasi next/image */}
        <img src="/images/splash/ball.svg" alt="" className={styles.sprite} data-sprite />
      </span>
      <span className={styles.flash} data-flash />
    </div>
  );
}
