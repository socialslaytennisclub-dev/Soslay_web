"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LEVEL_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./Members.module.css";

const FREQUENCIES = ["First time / Rarely", "1–2x/month", "1x/week", "2–3x/week", "4x+/week"];
const INTERESTS = ["Meet new people", "Improve my tennis", "Join tennis events", "Find tennis partners", "Travel & play tennis", "Tennis Trip / Destination", "Tennis + Dining", "Social Match"];

/** Baris filter tabel Members — semua filter disimpan di URL (bisa dibagikan & di-bookmark). */
export function MembersFilters({ cities }: { cities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  // Cari otomatis 300 ms setelah berhenti mengetik.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = window.setTimeout(() => update("q", q.trim()), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya bereaksi pada ketikan
  }, [q]);

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <label className={styles.select}>
      <span className="visually-hidden">{label}</span>
      <select value={params.get(key) ?? ""} onChange={(e) => update(key, e.target.value)}>
        <option value="">{label}: Semua</option>
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
        <span className="visually-hidden">Cari member</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, Kuy ID, Instagram…" />
      </label>
      {select("tier", "Tier", Object.entries(TIER_LABEL).map(([value, label]) => ({ value, label })))}
      {select("level", "Level", Object.entries(LEVEL_LABEL).map(([value, label]) => ({ value, label })))}
      {select("city", "Kota", [{ value: "Jakarta", label: "Jakarta (semua)" }, ...cities.map((c) => ({ value: c, label: c }))])}
      {select("frequency", "Frekuensi", FREQUENCIES.map((f) => ({ value: f, label: f })))}
      {select("interest", "Minat", INTERESTS.map((i) => ({ value: i, label: i })))}
    </div>
  );
}
