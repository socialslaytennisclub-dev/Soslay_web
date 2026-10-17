/** Skrip splash homepage — file biasa (bukan "use client") supaya bisa dipakai root layout. */

/**
 * Pasang <html data-splash> sebelum paint setiap kali homepage ("/") dibuka / di-refresh langsung,
 * kecuali reduced motion. Navigasi di dalam situs tidak menjalankan skrip ini lagi.
 */
export const SPLASH_SCRIPT = `try{if(location.pathname==="/"&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.setAttribute("data-splash","")}catch(e){}`;
