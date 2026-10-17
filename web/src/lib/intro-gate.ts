/**
 * Gerbang intro halaman: selama overlay pembuka (splash homepage) tampil, <html data-splash>
 * terpasang dan animasi intro (mis. heroIntro) menunggu. Overlay membuka gerbang saat terangkat.
 * Animasi tidak perlu tahu overlay apa yang menahannya.
 */
const OPEN_EVENT = "soslay:intro-gate-open";

const isClosed = () => document.documentElement.hasAttribute("data-splash");

/** Jalankan `start` sekarang, atau saat gerbang dibuka. Mengembalikan fungsi pembatal. */
export function whenIntroGateOpen(start: () => void): () => void {
  if (!isClosed()) {
    start();
    return () => {};
  }
  window.addEventListener(OPEN_EVENT, start, { once: true });
  return () => window.removeEventListener(OPEN_EVENT, start);
}

/** Buka gerbang (scroll aktif lagi, intro diputar). Aman dipanggil berkali-kali. */
export function openIntroGate() {
  if (!isClosed()) return;
  document.documentElement.removeAttribute("data-splash");
  window.dispatchEvent(new Event(OPEN_EVENT));
}
