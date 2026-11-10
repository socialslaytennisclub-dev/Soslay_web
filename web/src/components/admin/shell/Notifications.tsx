"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { AdminNotification } from "@/server/admin/notifications";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useDisclosure } from "@/hooks/useDisclosure";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./AdminShell.module.css";

const NotificationsContext = createContext<AdminNotification[]>([]);

/** Dimuat sekali di layout admin; lonceng di tiap halaman (AdminTopbar) membacanya. */
export function NotificationsProvider({ items, children }: { items: AdminNotification[]; children: ReactNode }) {
  return <NotificationsContext.Provider value={items}>{children}</NotificationsContext.Provider>;
}

const SEEN_KEY = "soslay.admin.notif-seen-v2";
type Seen = Record<string, number>;
const listeners = new Set<() => void>();
/** Snapshot mentah (string) — stabil untuk useSyncExternalStore; diurai di komponen. */
function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function parseSeen(raw: string): Seen {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Seen) : {};
  } catch {
    return {};
  }
}
function writeSeen(v: Seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(v));
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
  const { isOpen: open, toggle: toggleOpen, close } = useDisclosure();
  const wrap = useRef<HTMLDivElement>(null);
  const current: Seen = Object.fromEntries(items.map((i) => [i.key, i.count]));
  // Server & render pertama: anggap sudah dilihat semua (tanpa titik) supaya sama dengan HTML server.
  const seen = parseSeen(useSyncExternalStore(subscribe, readSeen, () => JSON.stringify(current)));
  // Titik hanya kalau ada antrean yang BERTAMBAH sejak lonceng terakhir dibuka.
  const unseen = items.some((i) => i.count > (seen[i.key] ?? 0));
  // Antrean berkurang (sudah ditangani) → turunkan angka "sudah dilihat", supaya kalau naik lagi titiknya menyala.
  const shrunk = Object.keys(seen).some((k) => seen[k] > (current[k] ?? 0));
  useEffect(() => {
    if (!shrunk) return;
    const lowered = parseSeen(readSeen());
    for (const k of Object.keys(lowered)) lowered[k] = Math.min(lowered[k], current[k] ?? 0);
    writeSeen(lowered);
  }, [shrunk, current]);

  useClickOutside(wrap, close, open);

  const toggle = () => {
    if (!open) writeSeen(current);
    toggleOpen();
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
                  <Link href={i.href} className={styles.notifItem} onClick={close}>
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
