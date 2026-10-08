"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PAYMENT_LABEL } from "@/lib/admin-labels";
import styles from "../activities/Activities.module.css";
import { AdminIcon } from "../ui/AdminIcon";

/** Filter Orders (cari, pembayaran, bulan) — tersimpan di URL. */
export function OrdersFilters({ months }: { months: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("order"); // detail yang terpilih mungkin tidak ada lagi di hasil filter
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = window.setTimeout(() => update("q", q.trim()), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya bereaksi pada ketikan
  }, [q]);

  return (
    <div className={styles.filters} aria-busy={pending}>
      <label className={styles.searchField}>
        <AdminIcon name="magnifying-glass" size={18} />
        <span className="visually-hidden">Cari order</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. order atau customer…" />
      </label>
      <label className={styles.select}>
        <AdminIcon name="coins" size={16} />
        <span className="visually-hidden">Pembayaran</span>
        <select value={params.get("payment") ?? ""} onChange={(e) => update("payment", e.target.value)}>
          <option value="">Pembayaran: Semua</option>
          {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={14} />
      </label>
      <label className={styles.select}>
        <AdminIcon name="calendar-dots" size={16} />
        <span className="visually-hidden">Bulan</span>
        <select value={params.get("month") ?? ""} onChange={(e) => update("month", e.target.value)}>
          <option value="">Semua bulan</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={14} />
      </label>
    </div>
  );
}
