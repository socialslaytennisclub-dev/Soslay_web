"use client";

import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import styles from "./SessionDetail.module.css";

/**
 * ?ended=N: baru saja diakhiri host (HL-5b) → "Hasil sudah tampil untuk N peserta". Dibaca dari URL di browser,
 * jadi hilang begitu host pindah tab (DetailTabs menghapus ?ended=) dan tidak muncul lagi saat kembali ke Hasil.
 */
export function EndedToast() {
  const ended = useSearchParams().get("ended");
  if (!ended || !/^\d+$/.test(ended)) return null;
  return (
    <p className={styles.endedToast} role="status">
      <Check size={16} aria-hidden /> Activity diakhiri. Hasil sudah tampil untuk {Number(ended)} peserta.
    </p>
  );
}
