"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { TextField } from "@/components/ui";
import { MIN_PASSWORD, passwordStrength } from "@/lib/auth";
import { cx } from "@/lib/cx";
import styles from "./AuthForms.module.css";

type PasswordFieldProps = Omit<ComponentPropsWithoutRef<typeof TextField>, "type" | "action"> & {
  /** Tampilkan bar kekuatan password di bawah field (untuk password baru). */
  showStrength?: boolean;
};

/** TextField password + tombol "Show / Hide", opsional bar kekuatan password. */
export function PasswordField({ showStrength, className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  const field = (
    <TextField
      {...props}
      className={showStrength ? undefined : className}
      type={visible ? "text" : "password"}
      action={
        <button
          type="button"
          className={styles.inlineAction}
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
  if (!showStrength) return field;

  const value = typeof props.value === "string" ? props.value : "";
  const strength = value ? passwordStrength(value) : null;

  return (
    <div className={cx(styles.passwordWrap, className)}>
      {field}
      <div className={styles.strength} data-level={strength?.level ?? 0} aria-hidden={!strength}>
        <div className={styles.strengthBars}>
          {[1, 2, 3, 4].map((bar) => (
            <span key={bar} className={cx(styles.strengthBar, strength && bar <= strength.level && styles.strengthOn)} />
          ))}
        </div>
        <p className={styles.strengthText} aria-live="polite">
          {strength ? (
            <>
              <strong>{strength.label}</strong>
              {strength.hint && ` · ${strength.hint}`}
            </>
          ) : (
            `Use ${MIN_PASSWORD}+ characters with a mix of letters, numbers & symbols`
          )}
        </p>
      </div>
    </div>
  );
}
