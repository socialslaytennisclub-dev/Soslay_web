"use client";

import Link from "next/link";
import { useState } from "react";
import { LEVEL_LABEL, TIER_LABEL, formatShortDate } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { MemberListItem } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { desktopOnlyClass, MemberAvatar, MobileCard, MobileCardList, TierBadge } from "../ui/AdminUI";
import styles from "./Members.module.css";

type SortKey = "name" | "points" | "last_played";

type MembersTableProps = {
  items: MemberListItem[];
  sort: string;
  dir: "asc" | "desc";
  /** Membangun URL dengan sort baru (dihitung di server, dikirim sebagai map). */
  sortHrefs: Record<SortKey, string>;
};

function toCsv(rows: MemberListItem[]) {
  const header = ["Member ID", "Nama", "Email", "Kuy ID", "Instagram", "Level", "Kota", "Sesi", "Poin", "Tier", "Terakhir main"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows.map((m) => [m.memberCode, m.fullName, m.email, m.kuyId, m.instagram, LEVEL_LABEL[m.level], m.city, m.sessionsAttended, m.pointsBalance, TIER_LABEL[m.tier], m.lastPlayedAt?.slice(0, 10) ?? ""])]
    .map((row) => row.map(escape).join(","))
    .join("\n");
}

/** Tabel Members (Figma 25:3767): pilih banyak → bar aksi massal navy; kolom Member/Poin/Terakhir main bisa di-sort. */
export function MembersTable({ items, sort, dir, sortHrefs }: MembersTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const chosen = items.filter((m) => selected.has(m.id));
  const allChecked = items.length > 0 && chosen.length === items.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportSelected = () => {
    const blob = new Blob([`﻿${toCsv(chosen)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `member-terpilih-${chosen.length}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortHeader = (key: SortKey, label: string) => (
    <Link href={sortHrefs[key]} scroll={false} className={cx(styles.sortLink, sort === key && styles.sortActive)} aria-label={`Urutkan ${label}`}>
      {label}
      <AdminIcon name="arrows-down-up" size={12} />
      {sort === key && <span className="visually-hidden">{dir === "asc" ? "naik" : "turun"}</span>}
    </Link>
  );

  return (
    <>
      {chosen.length > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="Aksi untuk member terpilih">
          <label className={styles.bulkCount}>
            <input type="checkbox" checked onChange={() => setSelected(new Set())} aria-label="Batalkan pilihan" />
            {chosen.length} member dipilih
          </label>
          <div className={styles.bulkActions}>
            <button type="button" className={styles.bulkButton} disabled title="Broadcast WhatsApp aktif setelah integrasi WhatsApp Business tersambung">
              <AdminIcon name="whatsapp-logo" size={16} />
              Kirim WhatsApp
            </button>
            <a className={styles.bulkButton} href={`mailto:?bcc=${chosen.map((m) => m.email).join(",")}`}>
              <AdminIcon name="envelope-simple" size={16} />
              Kirim email
            </a>
            <button type="button" className={styles.bulkButton} disabled title="Segera — butuh database (member_segments)">
              <AdminIcon name="tag" size={16} />
              Tambah ke segmen
            </button>
            <button type="button" className={styles.bulkButton} onClick={exportSelected}>
              <AdminIcon name="download-simple" size={16} />
              Export
            </button>
          </div>
        </div>
      )}

      {/* HP: kartu per member (checkbox tetap bisa dipakai untuk aksi massal) */}
      <div className={styles.mobileList}>
        {items.length > 0 && (
          <label className={styles.mobileSelectAll}>
            <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((m) => m.id)))} />
            Pilih semua di halaman ini
          </label>
        )}
        <MobileCardList label="Daftar member">
          {items.map((m) => (
            <MobileCard
              key={m.id}
              href={`/admin/members/${m.id}`}
              selected={selected.has(m.id)}
              leading={<input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Pilih ${m.fullName}`} />}
              title={
                <span className={styles.person}>
                  <MemberAvatar name={m.fullName} size={36} />
                  <span className={styles.personText}>
                    <span className={styles.personName}>{m.fullName}</span>
                    <span className={styles.personMeta}>
                      @{m.kuyId} · {m.city}
                    </span>
                  </span>
                </span>
              }
              aside={<TierBadge tier={m.tier} />}
              meta={[
                { label: "Level", value: LEVEL_LABEL[m.level] },
                { label: "Sesi · Poin", value: `${m.sessionsAttended} · ${m.pointsBalance.toLocaleString("id-ID")}` },
                { label: "Terakhir main", value: formatShortDate(m.lastPlayedAt) },
              ]}
            />
          ))}
        </MobileCardList>
        {items.length === 0 && <p className={styles.empty}>Tidak ada member yang cocok dengan filter ini.</p>}
      </div>

      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = chosen.length > 0 && !allChecked;
                  }}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((m) => m.id)))}
                  aria-label="Pilih semua di halaman ini"
                />
              </th>
              <th>{sortHeader("name", "Member")}</th>
              <th>Kuy ID</th>
              <th>Level</th>
              <th>Kota</th>
              <th className={styles.num}>Sesi</th>
              <th className={styles.num}>{sortHeader("points", "Poin")}</th>
              <th>Tier</th>
              <th>{sortHeader("last_played", "Terakhir main")}</th>
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className={cx(selected.has(m.id) && styles.rowSelected)}>
                <td className={styles.checkCol}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Pilih ${m.fullName}`} />
                </td>
                <td>
                  <Link href={`/admin/members/${m.id}`} className={styles.person}>
                    <MemberAvatar name={m.fullName} />
                    <span>
                      <span className={styles.personName}>{m.fullName}</span>
                      <span className={styles.personMeta}>{m.email}</span>
                    </span>
                  </Link>
                </td>
                <td>@{m.kuyId}</td>
                <td>{LEVEL_LABEL[m.level]}</td>
                <td>{m.city}</td>
                <td className={styles.num}>{m.sessionsAttended}</td>
                <td className={styles.num}>{m.pointsBalance.toLocaleString("id-ID")}</td>
                <td>
                  <TierBadge tier={m.tier} />
                </td>
                <td>{formatShortDate(m.lastPlayedAt)}</td>
                <td>
                  <Link href={`/admin/members/${m.id}`} className={styles.kebab} aria-label={`Buka ${m.fullName}`}>
                    <AdminIcon name="dots-three-vertical-bold" size={18} />
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className={styles.empty}>
                  Tidak ada member yang cocok dengan filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
