"use client";

import { BookOpen, X } from "lucide-react";
import { useDialog } from "@/hooks/useDialog";
import styles from "./SessionDetail.module.css";

/** "Aturan skor" — ringkasan cara main & penilaian (Figma UIF-07). */
export function ScoreRulesButton({ target, mode }: { target: number; mode: "points" | "wins" }) {
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  return (
    <>
      <button type="button" className={styles.btnOutline} onClick={open}>
        <BookOpen size={16} aria-hidden />
        Aturan skor
      </button>
      <dialog ref={dialogRef} className={styles.qrDialog} aria-labelledby="rules-title" onClick={onBackdropClick}>
        <div className={styles.qrPanel}>
          <header className={styles.qrHead}>
            <h2 id="rules-title">Aturan skor</h2>
            <button type="button" className={styles.qrClose} onClick={close} aria-label="Tutup">
              <X size={18} />
            </button>
          </header>
          <ul className={styles.rules}>
            <li>Tiap match dimainkan sampai total poin kedua tim = {target} (mis. 12–9). Tidak ada batas waktu.</li>
            <li>Partner berganti setiap ronde; court & pasangan mengikuti line-up dari host.</li>
            <li>Skor diinput & diverifikasi oleh host sesi — lapor skor ke host setelah match selesai.</li>
            <li>{mode === "wins" ? "Peringkat diurutkan dari jumlah menang, lalu total poin." : "Poin individu = skor tim kamu di setiap match yang kamu mainkan; peringkat diurutkan dari total poin."}</li>
            <li>Poin seri berbagi peringkat (=).</li>
          </ul>
          <button type="button" className={styles.btnNavy} onClick={close}>
            Mengerti
          </button>
        </div>
      </dialog>
    </>
  );
}
