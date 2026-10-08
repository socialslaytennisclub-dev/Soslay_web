"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/lib/cx";
import type { AdminVenue } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import styles from "./Catalog.module.css";

const SORTS = [
  { value: "popular", label: "Terpopuler" },
  { value: "sessions", label: "Sesi terbanyak" },
  { value: "name", label: "Nama A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

/** Admin / 07 Venues (Figma 25:5882). Tampil/sembunyi masih demo sampai Supabase tersambung. */
export function VenueGrid({ initial, monthLabel }: { initial: AdminVenue[]; monthLabel: string }) {
  const [venues, setVenues] = useState(initial);
  const [city, setCity] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const changed = venues.some((v, i) => v.visible !== initial[i].visible);

  const cities = ["Jakarta", "Bali"];
  const shown = venues
    .filter((v) => city === "all" || v.city === city)
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "sessions" ? b.sessionsThisMonth - a.sessionsThisMonth : (b.occupancy ?? -1) - (a.occupancy ?? -1),
    );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.pillTabs} role="group" aria-label="Kota">
          {[["all", "Semua", venues.length] as const, ...cities.map((c) => [c, c, venues.filter((v) => v.city === c).length] as const)].map(([value, label, count]) => (
            <button key={value} type="button" aria-pressed={city === value} className={cx(styles.pillTab, city === value && styles.pillTabActive)} onClick={() => setCity(value)}>
              {label}
              <span className={styles.tabCount}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <label className={styles.select}>
            <AdminIcon name="arrows-down-up" size={16} />
            <span className="visually-hidden">Urutkan</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Urutkan: {s.label}
                </option>
              ))}
            </select>
            <AdminIcon name="caret-down" size={14} />
          </label>
          <AdminButton variant="primary" icon="plus-bold" disabled title="Butuh database">
            Tambah venue
          </AdminButton>
        </div>
      </div>

      {changed && (
        <p className={styles.notice} role="status">
          Mode demo: perubahan tampil/sembunyi belum tersimpan karena database (Supabase) belum tersambung.
        </p>
      )}

      <ul className={styles.venueGrid}>
        {shown.map((v) => (
          <li key={v.slug} className={styles.venueCard}>
            <div className={styles.venueImage}>
              <Image src={v.image} alt="" fill sizes="(min-width: 1200px) 360px, (min-width: 640px) 50vw, 100vw" />
              <span className={styles.venueBadge}>
                <Badge tone={v.visible ? "lime" : "neutral"} dot>
                  {v.visible ? "Tampil di web" : "Disembunyikan"}
                </Badge>
              </span>
              <Link href={`/venue/${v.slug}`} target="_blank" className={styles.venueOpen} aria-label={`Buka halaman ${v.name}`}>
                <AdminIcon name="arrow-up-right" size={16} />
              </Link>
            </div>
            <div className={styles.venueBody}>
              <div>
                <h2 className={styles.venueName}>{v.name}</h2>
                <p className={styles.muted}>
                  {v.city} · {v.type}
                  {v.note && ` · ${v.note}`}
                </p>
              </div>
              <dl className={styles.venueStats}>
                <div>
                  <dt>Lapangan</dt>
                  <dd>{v.courts}</dd>
                </div>
                <div>
                  <dt>Sesi · {monthLabel}</dt>
                  <dd>{v.sessionsThisMonth}</dd>
                </div>
                <div>
                  <dt>Okupansi</dt>
                  <dd>{v.occupancy === null ? "—" : `${v.occupancy}%`}</dd>
                </div>
              </dl>
              <div className={styles.toggleRow}>
                <span>Tampil di halaman Venue</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={v.visible}
                  aria-label={`Tampilkan ${v.name} di halaman Venue`}
                  className={cx(styles.switch, v.visible && styles.switchOn)}
                  onClick={() => setVenues((list) => list.map((x) => (x.slug === v.slug ? { ...x, visible: !x.visible } : x)))}
                >
                  <span />
                </button>
              </div>
            </div>
          </li>
        ))}
        <li className={styles.addCard} title="Butuh database">
          <AdminIcon name="plus-bold" size={22} />
          <strong>Tambah venue baru</strong>
          <span className={styles.muted}>Foto, lokasi, tipe lapangan & fasilitas</span>
        </li>
      </ul>
    </>
  );
}
