import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./FilterChips.module.css";

export type FilterChip = { label: string; href: string; active?: boolean };

type FilterChipsProps = {
  items: FilterChip[];
  label: string;
  tone?: "light" | "dark";
  className?: string;
};

/** Baris pill filter berbasis link (URL = state filter, bisa dibagikan & di-bookmark). */
export function FilterChips({ items, label, tone = "light", className }: FilterChipsProps) {
  return (
    <nav aria-label={label} className={cx(styles.chips, styles[tone], className)}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              scroll={false}
              className={cx(styles.chip, item.active && styles.active)}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
