"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./OptionChips.module.css";

export type OptionChipValue = { value: string; label: string; hex?: string };

type OptionChipsProps = {
  label: string;
  options: OptionChipValue[];
  value?: string;
  onChange: (value: string) => void;
  /** Konten di kanan label (mis. link "Panduan Ukuran"). */
  aside?: ReactNode;
  error?: string;
};

/**
 * Figma: chip varian (Pilih Type / Ukuran) & swatch warna (Pilih Warna).
 * Semantik radio group native → navigasi panah & screen reader gratis.
 * Jika option punya `hex`, ditampilkan sebagai swatch bulat 44px.
 */
export function OptionChips({ label, options, value, onChange, aside, error }: OptionChipsProps) {
  const name = useId();
  const isSwatch = options.some((option) => option.hex);
  const selected = options.find((option) => option.value === value);

  return (
    <fieldset className={styles.group} aria-invalid={error ? true : undefined}>
      <div className={styles.header}>
        <legend className={styles.legend}>
          {label}
          {isSwatch && selected && <span className={styles.selected}> · {selected.label}</span>}
        </legend>
        {aside}
      </div>
      <div className={styles.options}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(styles.option, isSwatch ? styles.swatch : styles.chip)}
            title={isSwatch ? option.label : undefined}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="visually-hidden"
            />
            {isSwatch ? (
              <span className={styles.color} style={{ background: option.hex }} aria-hidden />
            ) : (
              option.label
            )}
            {isSwatch && <span className="visually-hidden">{option.label}</span>}
          </label>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
