"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AdminNotification } from "@/server/admin/notifications";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./AdminShell.module.css";

const NotificationsContext = createContext<AdminNotification[]>([]);

/** Dimuat sekali di layout admin; lonceng di tiap halaman (AdminTopbar) membacanya. */
export function NotificationsProvider({ items, children }: { items: AdminNotification[]; children: ReactNode }) {
  return <NotificationsContext.Provider value={items}>{children}</NotificationsContext.Provider>;
}

const SEEN_KEY = "soslay.admin.notif-seen";
const listeners = new Set<() => void>();
function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeSeen(v: string) {
  try {
    localStorage.setItem(SEEN_KEY, v);
  } catch {
    // Penyimpanan diblokir: titik tetap tampil, tidak masalah.
  }
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Lonceng + daftar antrean. Titik pink = ada yang berubah sejak lonceng terakhir dibuka. */
export function NotificationBell() {
  const items = useContext(NotificationsContext);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const signature = items.map((i) => `${i.key}:${i.count}`).join("|");
  // Server & render pertama: anggap sudah dilihat (tanpa titik) supaya tidak beda dengan HTML server.
  const seen = useSyncExternalStore(subscribe, readSeen, () => signature);
  // Titik hanya kalau ada antrean yang BERTAMBAH sejak lonceng terakhir dibuka (berkurang = sudah ditangani).
  const seenCounts = new Map(seen.split("|").map((part) => [part.split(":")[0], Number(part.split(":")[1]) || 0]));
  const unseen = items.some((i) => i.count > (seenCounts.get(i.key) ?? 0));
  // Antrean berkurang → turunkan juga angka "sudah dilihat", supaya kalau bertambah lagi titiknya menyala.
  const lowered = [...seenCounts]
    .map(([key, n]) => `${key}:${Math.min(n, items.find((i) => i.key === key)?.count ?? 0)}`)
    .filter((part) => !part.endsWith(":0"))
    .join("|");
  useEffect(() => {
    if (seen && lowered !== seen && seen !== signature) writeSeen(lowered);
  }, [seen, lowered, signature]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) writeSeen(signature);
    setOpen(!open);
  };

  return (
    <div className={styles.notifWrap} ref={wrap}>
      <button type="button" className={styles.iconButton} aria-label={`Notifikasi${items.length ? ` (${items.length})` : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <AdminIcon name="bell-simple" size={20} />
        {unseen && <span className={styles.notifDot} aria-hidden />}
      </button>
      {open && (
        <div className={styles.notifPanel} role="dialog" aria-label="Notifikasi">
          <p className={styles.notifHead}>Notifikasi</p>
          {items.length ? (
            <ul className={styles.notifList}>
              {items.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className={styles.notifItem} onClick={() => setOpen(false)}>
                    <span className={styles.notifIcon}>
                      <AdminIcon name={i.icon} size={18} />
                    </span>
                    <span>
                      <strong>{i.title}</strong>
                      <small>{i.detail}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.notifEmpty}>Tidak ada yang perlu ditindaklanjuti.</p>
          )}
        </div>
      )}
    </div>
  );
}
