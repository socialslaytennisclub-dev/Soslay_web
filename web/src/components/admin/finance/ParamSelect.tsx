"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/lib/cx";
import styles from "./Finance.module.css";

/** Dropdown filter yang mengubah satu query param (periode, kategori, akun, …). Nilai "" menghapus param. */
export function ParamSelect({ name, value, options, label, reset = [], className }: { name: string; value: string; options: { value: string; label: string }[]; label: string; reset?: string[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <select
      className={cx(styles.select, className)}
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        for (const r of reset) next.delete(r);
        const qs = next.toString();
        start(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
