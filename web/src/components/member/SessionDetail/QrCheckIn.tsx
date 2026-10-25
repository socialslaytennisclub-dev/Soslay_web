"use client";

import { Clock, Download, QrCode, X } from "lucide-react";
import { useDialog } from "@/hooks/useDialog";
import styles from "./SessionDetail.module.css";

/** Tombol "Tampilkan QR Check-in" + modal QR (Figma UIF-06 langkah 3). */
export function QrCheckIn({ qrSvg, code, holder, title, openNote }: { qrSvg: string; code: string; holder: string; title: string; openNote: string }) {
  const { dialogRef, open, close, onBackdropClick } = useDialog();

  // E-ticket sederhana (SVG): QR + kode booking + nama, bisa disimpan ke galeri / dicetak.
  const download = () => {
    const inner = qrSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const viewBox = qrSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";
    const size = Number(viewBox.split(" ")[2]) || 33;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
<rect width="480" height="640" rx="24" fill="#0a084a"/>
<text x="40" y="64" fill="#d4ef1d" font-family="Arial" font-size="14" font-weight="700" letter-spacing="2">E-TICKET · SOSLAY</text>
<text x="40" y="100" fill="#fff" font-family="Arial" font-size="22" font-weight="700">${esc(title)}</text>
<rect x="100" y="132" width="280" height="280" rx="16" fill="#fff"/>
<svg x="120" y="152" width="240" height="240" viewBox="0 0 ${size} ${size}">${inner}</svg>
<text x="240" y="460" fill="#c9caf0" font-family="Arial" font-size="14" text-anchor="middle">Kode booking</text>
<text x="240" y="494" fill="#fff" font-family="Arial" font-size="26" font-weight="700" text-anchor="middle" letter-spacing="1">${esc(code)}</text>
<text x="240" y="560" fill="#fff" font-family="Arial" font-size="16" text-anchor="middle">${esc(holder)}</text>
</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `e-ticket-${code}.svg` });
    a.click();
    // Safari / Firefox membaca blob setelah klik selesai — jangan dicabut di tick yang sama.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <button type="button" className={styles.qrButton} onClick={open}>
        <QrCode size={20} aria-hidden />
        Tampilkan QR Check-in
      </button>
      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="qr-title" onClick={onBackdropClick}>
        <div className={styles.qrPanel}>
          <header className={styles.qrHead}>
            <h2 id="qr-title">QR Check-in</h2>
            <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
              <X size={18} />
            </button>
          </header>
          <p className={styles.muted}>Tunjukkan QR ini ke panitia di meja registrasi. Naikkan kecerahan layar agar mudah dipindai.</p>
          <div className={styles.qrBig} dangerouslySetInnerHTML={{ __html: qrSvg }} role="img" aria-label={`QR check-in ${code}`} />
          <p className={styles.qrCode}>
            <strong>{code}</strong>
            <span>{holder}</span>
          </p>
          <p className={styles.qrNote}>
            <Clock size={16} aria-hidden />
            {openNote}
          </p>
          <div className={styles.qrActions}>
            <button type="button" className={styles.btnOutline} onClick={download}>
              <Download size={16} aria-hidden />
              Unduh e-ticket
            </button>
            <button type="button" className={styles.btnNavy} onClick={close}>
              Selesai
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
