"use client";

import { useCallback, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "../Icon/Icon";
import { useClickOutside } from "@/hooks/useClickOutside";
import { isValidIsoDate } from "@/lib/auth";
import { DatePicker } from "./DatePicker";
import styles from "./Field.module.css";

type FieldShellProps = {
  label: string;
  required?: boolean;
  error?: string;
  /** Teks tetap di kiri input, mis. "+62" atau "@". */
  prefix?: string;
  /** Ikon di kanan (kalender, caret). */
  icon?: IconName;
  /** Aksi di kanan input, mis. tombol "Ubah". */
  action?: ReactNode;
  className?: string;
  children: (props: { id: string; describedBy?: string }) => ReactNode;
};

/** Label + kotak input Figma (h47, radius 12, border neutral-200, padding 12/16). */
function FieldShell({ label, required, error, prefix, icon, action, className, children }: FieldShellProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && " *"}
      </label>
      <div className={cx(styles.control, error && styles.invalid)}>
        {prefix && (
          <span className={styles.prefix} aria-hidden>
            {prefix}
          </span>
        )}
        {children({ id, describedBy: error ? errorId : undefined })}
        {icon && <Icon name={icon} size={20} className={styles.icon} />}
        {action}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<FieldShellProps, "children" | "icon"> &
  Omit<ComponentPropsWithoutRef<"input">, "className" | "prefix" | "id"> & { icon?: IconName };

export function TextField({ label, required, error, prefix, icon, action, className, ...inputProps }: TextFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error} prefix={prefix} icon={icon} action={action} className={className}>
      {({ id, describedBy }) => (
        <input
          {...inputProps}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={styles.input}
        />
      )}
    </FieldShell>
  );
}

/** "2001-07-05" → "05 / 07 / 2001". */
const isoToText = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d} / ${m} / ${y}` : "";
};

/** Digit yang diketik → "DD / MM / YYYY" bertahap. */
const formatDigits = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join(" / ");

/** "05 / 07 / 2001" → "2001-07-05" bila tanggalnya ada di kalender, selain itu "". */
function textToIso(text: string) {
  const digits = text.replace(/\D/g, "");
  const iso = digits.length === 8 ? `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : "";
  return isValidIsoDate(iso) ? iso : "";
}

type DateFieldProps = Omit<FieldShellProps, "children" | "icon" | "prefix" | "action"> & {
  /** ISO "YYYY-MM-DD", "" (kosong), atau teks ketikan apa adanya bila belum valid — cek dengan validateBirthDate. */
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  max?: string;
};

/**
 * Tanggal "DD / MM / YYYY" (Figma) yang bisa diketik langsung — garis miring otomatis, keyboard angka
 * di HP — plus ikon kalender yang membuka kalender Soslay (DatePicker), bukan pemilih bawaan browser.
 */
export function DateField({ label, required, error, className, value, onChange, autoComplete, max }: DateFieldProps) {
  const [text, setText] = useState(() => isoToText(value));

  // Nilai dari luar berubah (profil termuat / form di-reset) → tampilkan. Teks ketikan sendiri dibiarkan.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== text && value !== textToIso(text)) setText(isValidIsoDate(value) ? isoToText(value) : value);
  }

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }, []);
  const dismiss = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, dismiss, open);

  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      className={className}
      action={
        <span ref={wrapRef} className={styles.pickerWrap}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.iconButton}
            onClick={() => setOpen((v) => !v)}
            aria-label={`Pick ${label.toLowerCase()} from calendar`}
            aria-expanded={open}
          >
            <Icon name="calendar-blank" size={20} />
          </button>
          {open && (
            <DatePicker
              value={isValidIsoDate(value) ? value : ""}
              max={max}
              onClose={close}
              onSelect={(iso) => {
                setText(isoToText(iso));
                onChange(iso);
                close();
              }}
            />
          )}
        </span>
      }
    >
      {({ id, describedBy }) => (
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete={autoComplete}
          placeholder="DD / MM / YYYY"
          maxLength={14}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={styles.input}
          value={text}
          onChange={(event) => {
            const raw = event.target.value;
            // Autofill browser (autoComplete="bday") mengisi "YYYY-MM-DD" — jangan diacak jadi DD/MM.
            const next = isValidIsoDate(raw) ? isoToText(raw) : formatDigits(raw.replace(/\D/g, "").slice(0, 8));
            setText(next);
            onChange(textToIso(next) || next);
          }}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = Omit<FieldShellProps, "children" | "icon" | "prefix" | "action"> & {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SelectField({ label, required, error, className, options, value, onChange, placeholder }: SelectFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error} icon="caret-down-bold" className={className}>
      {({ id, describedBy }) => (
        <select
          id={id}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(styles.input, styles.select, !value && styles.empty)}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
