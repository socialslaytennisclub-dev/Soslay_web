"use client";

import { Icon } from "../Icon/Icon";
import styles from "./QuantityStepper.module.css";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Nama produk untuk label tombol, mis. "Kurangi A Piece of Bali". */
  itemLabel: string;
};

/** Figma: stepper pill (− qty +), border indigo-border. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, itemLabel }: QuantityStepperProps) {
  return (
    <div className={styles.stepper} role="group" aria-label={`Jumlah ${itemLabel}`}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Kurangi ${itemLabel}`}
      >
        <Icon name="minus-bold" size={20} />
      </button>
      <output className={styles.value} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Tambah ${itemLabel}`}
      >
        <Icon name="plus-bold" size={20} />
      </button>
    </div>
  );
}
