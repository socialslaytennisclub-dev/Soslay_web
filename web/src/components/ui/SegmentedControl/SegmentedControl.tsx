"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import styles from "./SegmentedControl.module.css";

type SegmentedControlProps<T extends string> = {
  /** Label untuk screen reader. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/** Figma: Segmented (1 Bln · 3 Bln · 1 Thn). Radio group native → navigasi panah gratis. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: SegmentedControlProps<T>) {
  const name = useId();

  return (
    <fieldset className={cx(styles.group, className)}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className={cx(styles.segment, option.value === value && styles.active)}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="visually-hidden"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
