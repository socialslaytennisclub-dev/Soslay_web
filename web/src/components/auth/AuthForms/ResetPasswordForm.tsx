"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { resetPage } from "@/content/auth";
import { updatePassword } from "@/server/auth/actions";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

/** Setel password baru setelah membuka link reset (sesi sudah dibuat oleh /auth/confirm). */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setFormError("Passwords don't match.");
    startSubmit(async () => {
      const result = await updatePassword(password);
      setFieldError(result?.fieldError);
      setFormError(result?.error ?? null);
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          value={password}
          error={fieldError}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldError(undefined);
            setFormError(null);
          }}
        />
        <PasswordField
          label="Repeat password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            setFormError(null);
          }}
        />
      </div>
      {formError && (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      )}
      <Button type="submit" variant="arrow" className={styles.submit} disabled={submitting}>
        {submitting ? "Saving…" : resetPage.submit}
      </Button>
    </form>
  );
}
