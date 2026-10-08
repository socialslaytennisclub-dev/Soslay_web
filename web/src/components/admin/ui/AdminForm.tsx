"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./AdminForm.module.css";

/** Kontrol form admin tambahan (switch, textarea dengan penghitung, chip multi-pilih). */

type ToggleProps = { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void };

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className={styles.toggleRow}>
      <label htmlFor={id} className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={styles.toggleHint}>{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={cx(styles.switch, checked && styles.switchOn)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchKnob} />
      </button>
    </div>
  );
}

type TextAreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
  error?: string;
  rows?: number;
};

export function TextArea({ label, value, onChange, maxLength, required, error, rows = 4 }: TextAreaProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && " *"}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cx(styles.textarea, error && styles.invalid)}
      />
      <span className={styles.counter}>
        {value.length}/{maxLength} karakter
      </span>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

type MultiChipsProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  values: T[];
  onChange: (values: T[]) => void;
};

/** Chip pilihan ganda (Level yang disarankan). */
export function MultiChips<T extends string>({ label, options, values, onChange }: MultiChipsProps<T>) {
  return (
    <fieldset className={styles.chipGroup}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.chips}>
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              className={cx(styles.chip, on && styles.chipOn)}
              onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Kartu form admin: judul + subjudul + isi. */
export function FormCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{title}</h2>
          {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
