"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./SessionDetail.module.css";

const parts = (ms: number) => {
  const left = Math.max(0, ms);
  return [
    { label: "Hari", value: Math.floor(left / 86_400_000) },
    { label: "Jam", value: Math.floor(left / 3_600_000) % 24 },
    { label: "Menit", value: Math.floor(left / 60_000) % 60 },
  ];
};

/** Hitung mundur Hari / Jam / Menit ke mulai sesi (Figma UIF-06). Diperbarui tiap 30 detik. */
export function Countdown({ target, size = "md" }: { target: string; size?: "md" | "sm" }) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <ul className={cx(styles.countdown, size === "sm" && styles.countdownSm)} aria-label="Waktu sampai sesi dimulai">
      {parts(end - now).map((p) => (
        <li key={p.label}>
          <strong suppressHydrationWarning>{String(p.value).padStart(2, "0")}</strong>
          <span>{p.label}</span>
        </li>
      ))}
    </ul>
  );
}
