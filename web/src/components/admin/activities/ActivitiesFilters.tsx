"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import styles from "./Activities.module.css";

type ActivitiesFiltersProps = {
  types: { slug: string; label: string }[];
  venues: string[];
  /** Pilihan rentang tanggal sudah dihitung di server (relatif ke "hari ini"). */
  ranges: { value: string; label: string }[];
};

/** Filter Activities — tersimpan di URL seperti halaman Members. */
export function ActivitiesFilters({ types, venues, ranges }: ActivitiesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = window.setTimeout(() => update("q", q.trim()), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya bereaksi pada ketikan
  }, [q]);

  const select = (key: string, label: string, icon: AdminIconName, options: { value: string; label: string }[], allLabel = `${label}: Semua`) => (
    <label className={styles.select}>
      <AdminIcon name={icon} size={16} />
      <span className="visually-hidden">{label}</span>
      <select value={params.get(key) ?? ""} onChange={(e) => update(key, e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <AdminIcon name="caret-down" size={14} />
    </label>
  );

  return (
    <div className={styles.filters} aria-busy={pending}>
      <label className={styles.searchField}>
        <AdminIcon name="magnifying-glass" size={18} />
        <span className="visually-hidden">Cari sesi</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul sesi atau venue…" />
      </label>
      {select("type", "Tipe", "tag", types.map((t) => ({ value: t.slug, label: t.label })))}
      {select("venue", "Venue", "map-pin", venues.map((v) => ({ value: v, label: v })))}
      {select("city", "Kota", "map-trifold", [{ value: "Jakarta", label: "Jakarta" }, { value: "Bali", label: "Bali" }])}
      {select("range", "Tanggal", "calendar-dots", ranges, "Rentang default")}
    </div>
  );
}
