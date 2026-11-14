"use client";

import { checkEmailTypo } from "@/lib/email-typo";
import { cx } from "@/lib/cx";
import styles from "./Field.module.css";

/**
 * "Did you mean joe@gmail.com?" di bawah field email — satu klik mengganti isian.
 * Tidak tampil bila email tidak mencurigakan. `prompt` = teks pembuka (member: Inggris, admin: Indonesia).
 */
export function EmailSuggestion({ email, onAccept, prompt = "Did you mean", className }: { email: string; onAccept: (email: string) => void; prompt?: string; className?: string }) {
  const { suggestion } = checkEmailTypo(email);
  if (!suggestion) return null;
  return (
    <p className={cx(styles.suggestion, className)} role="status">
      {prompt}{" "}
      {/* "?" di dalam tombol: <button> selalu inline-block, jadi teks di luarnya turun ke baris sendiri saat email panjang. */}
      <button type="button" className={styles.suggestionButton} onClick={() => onAccept(suggestion)}>
        <span className={styles.suggestionEmail}>{suggestion}</span>
        <span className={styles.suggestionMark} aria-hidden>
          ?
        </span>
      </button>
    </p>
  );
}
