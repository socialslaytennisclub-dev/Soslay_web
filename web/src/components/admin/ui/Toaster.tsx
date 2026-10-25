"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import { AdminIcon } from "./AdminIcon";
import styles from "./Toaster.module.css";

/**
 * Toast admin: umpan balik semua aksi CRUD (simpan, hapus, publikasi, check-in, …).
 * Panggil `toast.result(result)` dengan hasil server action, atau `toast.success()` /
 * `toast.error()`. <Toaster /> dipasang sekali di layout admin.
 *
 * Tumpukan toast tampil sebagai popover (top layer) supaya tetap terlihat di atas drawer
 * & dialog native yang sedang terbuka.
 */

type Tone = "success" | "error";
type ToastItem = { id: number; text: string; tone: Tone };

const DURATION: Record<Tone, number> = { success: 4500, error: 7000 };
const MAX_VISIBLE = 4;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(text: string, tone: Tone) {
  // Pesan yang sama berturut-turut (mis. klik dua kali) cukup satu.
  items = [...items.filter((t) => t.text !== text), { id: nextId++, text, tone }].slice(-MAX_VISIBLE);
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text: string) => push(text, "success"),
  error: (text: string) => push(text, "error"),
  /** Hasil server action admin ({ ok, message } / { ok: false, error }). */
  result: (result: { ok: true; message: string } | { ok: false; error: string }) =>
    result.ok ? push(result.message, "success") : push(result.error, "error"),
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;
const empty: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  const ref = useRef<HTMLDivElement>(null);

  // Tampilkan ulang popover tiap ada toast baru → selalu di atas dialog yang dibuka belakangan.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (list.length) el.showPopover();
  }, [list]);

  return (
    <div ref={ref} popover="manual" className={styles.region} aria-live="polite" aria-relevant="additions">
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const timer = useRef<number | null>(null);
  const start = () => {
    timer.current = window.setTimeout(() => dismiss(item.id), DURATION[item.tone]);
  };
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };

  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satu timer per toast
  }, []);

  return (
    <div
      className={cx(styles.toast, item.tone === "error" && styles.error)}
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocus={stop}
      onBlur={start}
    >
      <span className={styles.icon}>
        <AdminIcon name={item.tone === "error" ? "warning-circle" : "check-circle"} size={18} />
      </span>
      <p className={styles.text}>{item.text}</p>
      <button type="button" className={styles.close} aria-label="Tutup notifikasi" onClick={() => dismiss(item.id)}>
        <AdminIcon name="x" size={14} />
      </button>
    </div>
  );
}

/** Toast sekali saat halaman dibuka — untuk pesan setelah redirect (mis. ?saved=new). */
export function ToastOnMount({ text, tone = "success" }: { text: string; tone?: Tone }) {
  useEffect(() => {
    // Ditunda satu tick: efek halaman jalan sebelum <Toaster /> (di layout) berlangganan.
    const id = window.setTimeout(() => push(text, tone), 0);
    return () => window.clearTimeout(id);
  }, [text, tone]);
  return null;
}
