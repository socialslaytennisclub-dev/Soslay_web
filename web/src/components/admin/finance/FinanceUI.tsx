import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { isAutoSource } from "@/lib/finance/sources";
import type { FinanceRole, FinTx } from "@/lib/finance/types";
import styles from "./Finance.module.css";

/** Tab modul Keuangan (§6.3b urutan: Ringkasan · Transaksi · Laba Rugi · Per event · Neraca · Tahunan). */
export const FINANCE_TABS = [
  { key: "ringkasan", label: "Ringkasan", href: "/admin/keuangan" },
  { key: "transaksi", label: "Transaksi", href: "/admin/keuangan/transaksi" },
  { key: "laba-rugi", label: "Laba Rugi", href: "/admin/keuangan/laba-rugi" },
  { key: "event", label: "Per event", href: "/admin/keuangan/event" },
  { key: "neraca", label: "Neraca", href: "/admin/keuangan/neraca" },
  { key: "tahunan", label: "Tahunan", href: "/admin/keuangan/tahunan" },
] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number]["key"];

export function FinanceTabs({ active, role, query = "" }: { active: FinanceTab; role: FinanceRole; query?: string }) {
  // Pencatat keuangan hanya melihat Transaksi (12x) — tab laporan tidak tampil.
  const tabs = role === "full" ? FINANCE_TABS : FINANCE_TABS.filter((t) => t.key === "transaksi");
  if (tabs.length < 2) return null;
  return (
    <nav className={styles.tabs} aria-label="Bagian Keuangan">
      {tabs.map((t) => (
        <Link key={t.key} href={`${t.href}${query}`} className={cx(styles.tab, active === t.key && styles.tabActive)} aria-current={active === t.key ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function PageHead({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className={styles.head}>
      <div>
        {back && (
          <Link href={back.href} className={styles.back}>
            ‹ {back.label}
          </Link>
        )}
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

/** Badge kolom Sumber: Otomatis · Manual · Import · Transfer · Modal. */
export function SourcePill({ tx }: { tx: Pick<FinTx, "source" | "type"> }) {
  if (tx.type === "transfer") return <span className={cx(styles.pill, styles.pillTransfer)}>Transfer</span>;
  if (tx.type === "owner_withdrawal" || tx.type === "owner_contribution") return <span className={cx(styles.pill, styles.pillNavy)}>Modal</span>;
  if (isAutoSource(tx.source)) return <span className={cx(styles.pill, styles.pillAuto)}>Otomatis</span>;
  if (tx.source === "import") return <span className={styles.pill}>Import</span>;
  return <span className={styles.pill}>Manual</span>;
}

export function StatStrip({ items }: { items: { label: string; value: ReactNode; note?: ReactNode; tone?: "neg" | "pos" }[] }) {
  return (
    <div className={styles.statStrip}>
      {items.map((it) => (
        <div key={it.label} className={styles.stat}>
          <span className={styles.statLabel}>{it.label}</span>
          <span className={cx(styles.statValue, it.tone === "neg" && styles.neg)}>{it.value}</span>
          {it.note && <span className={styles.statNote}>{it.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** Pilihan periode lewat link (dipakai Laba Rugi: Bulanan · Kuartal · Tahunan). */
export function SegmentLinks({ items, active, label }: { items: { key: string; label: string; href: string; count?: number }[]; active: string; label: string }) {
  return (
    <nav className={styles.segment} aria-label={label}>
      {items.map((it) => (
        <Link key={it.key} href={it.href} scroll={false} className={cx(styles.segBtn, active === it.key && styles.segActive)} aria-current={active === it.key ? "true" : undefined}>
          {it.label}
          {it.count !== undefined && <span className={styles.count}>{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
