"use client";

import { gsap } from "@/lib/gsap";

/**
 * Efek "Add to bag": bola tenis lime terlempar melengkung dari tombol ke ikon tas di navbar
 * (elemen ber-atribut `data-cart-target`), ikon tas memantul, plus bunyi pukulan bola tenis.
 * Bunyi disintesis Web Audio (tanpa file audio). Reduced motion → tanpa lemparan, bunyi & pantulan tetap.
 */

let audio: AudioContext | null = null;

/** Bunyi "pock" bola tenis: dentum rendah singkat + desis senar (noise band-pass). */
function tennisPock(volume = 1) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    // Dentum bola (sine yang cepat turun nadanya)
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(320, now);
    thump.frequency.exponentialRampToValueAtTime(110, now + 0.09);
    thumpGain.gain.setValueAtTime(0.55 * volume, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.13);

    // "Tak" senar raket (burst noise pendek di sekitar 1,8 kHz)
    const length = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const noise = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 1.2;
    noiseGain.gain.value = 0.35 * volume;
    noise.connect(band).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
  } catch {
    // Audio tidak tersedia (mis. diblokir browser) → efek visual tetap jalan.
  }
}

const BALL_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
  <circle cx="12" cy="12" r="11" fill="#CAF100" stroke="#A9CC00" stroke-width="1"/>
  <path d="M4.2 4.6c3.6 2.6 3.6 12.2 0 14.8M19.8 4.6c-3.6 2.6-3.6 12.2 0 14.8" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

function bounceCart(target: HTMLElement) {
  gsap.fromTo(target, { scale: 1 }, { scale: 1.25, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1, clearProps: "transform" });
}

export function flyToCart(from: HTMLElement) {
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  tennisPock();
  if (!target) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const end = target.getBoundingClientRect();
  if (reduced || end.width === 0) {
    bounceCart(target);
    return;
  }

  const start = from.getBoundingClientRect();
  const size = 24;
  const ball = document.createElement("span");
  ball.innerHTML = BALL_SVG;
  Object.assign(ball.style, {
    position: "fixed",
    left: `${start.left + start.width / 2 - size / 2}px`,
    top: `${start.top + start.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: "9999",
    pointerEvents: "none",
    filter: "drop-shadow(0 4px 6px rgb(10 8 74 / 0.35))",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ball);

  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  // Puncak lengkungan: sedikit di atas titik tertinggi (awal/tujuan), tapi tidak keluar layar.
  const startY = start.top + start.height / 2;
  const lift = Math.min(160, Math.max(60, Math.abs(dx) * 0.25));
  const peak = Math.max(Math.min(0, dy) - lift, size - startY);
  const duration = Math.min(1, 0.55 + Math.hypot(dx, dy) / 2400);

  gsap
    .timeline({
      onComplete: () => {
        ball.remove();
        bounceCart(target);
        tennisPock(0.45);
      },
    })
    .to(ball, { x: dx, duration, ease: "power1.inOut" }, 0)
    .to(ball, { keyframes: [{ y: peak, ease: "power2.out" }, { y: dy, ease: "power2.in" }], duration }, 0)
    .to(ball, { rotation: 720, duration, ease: "none" }, 0)
    .fromTo(ball, { scale: 1.3 }, { scale: 0.7, duration, ease: "power1.in" }, 0);
}
