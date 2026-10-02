"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "../Icon/Icon";
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
