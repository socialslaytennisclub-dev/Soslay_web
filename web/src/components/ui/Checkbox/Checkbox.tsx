"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "../Icon/Icon";
import styles from "./Checkbox.module.css";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Label terlihat. Tanpa children wajib isi `label` untuk screen reader. */
  children?: ReactNode;
  label?: string;
  /** tile: kotak pilihan ber-border (Community Preferences). */
  variant?: "plain" | "tile";
  /** Sebagian item terpilih ("Pilih semua"). */
  indeterminate?: boolean;
  className?: string;
};

/** Figma: checkbox 20px radius 4 — indigo-600 + ikon check saat terpilih. */
export function Checkbox({ checked, onChange, children, label, variant = "plain", indeterminate, className }: CheckboxProps) {
  return (
    <label className={cx(styles.root, styles[variant], checked && styles.checked, className)}>
      <input
        type="checkbox"
        className="visually-hidden"
        checked={checked}
        aria-label={children ? undefined : label}
        aria-checked={indeterminate ? "mixed" : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={cx(styles.box, (checked || indeterminate) && styles.boxOn)} aria-hidden>
        {checked ? <Icon name="check-bold" size={14} /> : indeterminate ? <span className={styles.dash} /> : null}
      </span>
      {children && <span className={styles.label}>{children}</span>}
    </label>
  );
}
