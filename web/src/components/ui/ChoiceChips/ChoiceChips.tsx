"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import styles from "./ChoiceChips.module.css";

type ChoiceChipsProps = {
  label: string;
  required?: boolean;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/**
 * Figma: choice chip form profil (radius 12, border neutral-200; terpilih = border indigo-600 + bg indigo-50).
 * Beda dengan OptionChips (pill varian produk). Radio group native.
 */
export function ChoiceChips({ label, required, options, value, onChange, error }: ChoiceChipsProps) {
  const name = useId();
  const errorId = `${name}-error`;

  return (
    <fieldset className={styles.group} aria-describedby={error ? errorId : undefined}>
      <legend className={styles.legend}>
        {label}
        {required && " *"}
      </legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option} className={cx(styles.chip, option === value && styles.selected)}>
            <input
              type="radio"
              name={name}
              value={option}
              required={required}
              checked={option === value}
              onChange={() => onChange(option)}
              className="visually-hidden"
            />
            {option}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
