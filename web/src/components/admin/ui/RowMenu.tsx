"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cx } from "@/lib/cx";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import styles from "./RowMenu.module.css";

export type RowMenuItem = {
  label: string;
  icon?: AdminIconName;
  onSelect: () => void;
  danger?: boolean;
  /** Alasan item tidak bisa dipakai (tampil sebagai tooltip); kosong = aktif. */
  disabledReason?: string | null;
  disabled?: boolean;
};

/**
 * Menu aksi per baris (titik tiga). Daftar memakai posisi `fixed` di bawah tombolnya (di atasnya bila tidak
 * muat di layar) supaya tidak terpotong wadah tabel yang bisa digulir; tertutup saat klik di luar, Esc,
 * gulir, atau ubah ukuran.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; anchorTop: number } | null>(null);

  // Tidak muat di bawah tombol → buka ke atas (diukur sebelum digambar, tanpa render ulang).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!pos || !list) return;
    const h = list.offsetHeight;
    if (pos.top + h > window.innerHeight - 8) list.style.top = `${Math.max(8, pos.anchorTop - h - 4)}px`;
  }, [pos]);

  const close = useCallback(() => setPos(null), []);
  useClickOutside(wrapRef, close, Boolean(pos));

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = buttonRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right, anchorTop: r.top });
  };

  return (
    <span ref={wrapRef} className={styles.wrap}>
      <button ref={buttonRef} type="button" className={styles.trigger} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={toggle}>
        <AdminIcon name="dots-three-vertical-bold" size={18} />
      </button>
      {pos && (
        <div ref={listRef} className={styles.list} role="menu" aria-label={label} style={{ top: pos.top, right: pos.right }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx(item.danger && styles.danger)}
              disabled={item.disabled || Boolean(item.disabledReason)}
              title={item.disabledReason ?? undefined}
              onClick={() => {
                setPos(null);
                item.onSelect();
              }}
            >
              {item.icon && <AdminIcon name={item.icon} size={16} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
