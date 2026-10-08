"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { TextField } from "@/components/ui";
import styles from "./AuthForms.module.css";

type PasswordFieldProps = Omit<ComponentPropsWithoutRef<typeof TextField>, "type" | "action">;

/** TextField password + tombol "Lihat / Sembunyikan". */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      action={
        <button
          type="button"
          className={styles.inlineAction}
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
        >
          {visible ? "Sembunyikan" : "Lihat"}
        </button>
      }
    />
  );
}
