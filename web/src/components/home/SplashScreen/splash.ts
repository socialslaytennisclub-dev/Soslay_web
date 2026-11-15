/** Skrip splash homepage — file biasa (bukan "use client") supaya bisa dipakai root layout. */

import { OPEN_EVENT } from "@/lib/intro-gate";

/**
 * Pasang <html data-splash> sebelum paint setiap kali homepage ("/") dibuka / di-refresh langsung,
 * kecuali reduced motion. Navigasi di dalam situs tidak menjalankan skrip ini lagi.
 *
 * Pengaman: overlay navy hanya dilepas oleh SplashScreen (React + GSAP). Bila komponen itu telat / gagal
 * memulai animasi (HP Android lambat, JS halaman error), layar tertahan navy polos. Maka bila setelah
 * SPLASH_FAILSAFE_MS animasi belum mulai (belum ada [data-splash-root][data-active]), skrip ini melepas
 * data-splash sendiri → homepage tampil. Ditulis ES5 (tanpa arrow function) supaya aman di browser lama.
 */
const SPLASH_FAILSAFE_MS = 4500;

export const SPLASH_SCRIPT = `try{if(location.pathname==="/"&&!matchMedia("(prefers-reduced-motion: reduce)").matches){var d=document.documentElement;d.setAttribute("data-splash","");setTimeout(function(){if(d.hasAttribute("data-splash")&&!document.querySelector("[data-splash-root][data-active]")){d.removeAttribute("data-splash");window.dispatchEvent(new Event("${OPEN_EVENT}"))}},${SPLASH_FAILSAFE_MS})}}catch(e){}`;
