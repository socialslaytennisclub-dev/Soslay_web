"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { forgotPage } from "@/content/auth";
import { validateEmail } from "@/lib/auth";
import { requestPasswordReset } from "@/server/auth/actions";
import styles from "./AuthForms.module.css";

/** Lupa password: kirim link reset ke email (server action `requestPasswordReset`). */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid) return setFieldError(invalid);
    startSubmit(async () => {
      const result = await requestPasswordReset(email);
      setFieldError(result.fieldError);
      setFormError(result.error ?? null);
      if (result.sent) setSent(result.sent);
    });
  }

  if (sent) {
    return (
      <div className={styles.confirm} role="status">
        <p className={styles.confirmTitle}>{forgotPage.sent.title}</p>
        <p>{forgotPage.sent.text(sent)}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          error={fieldError}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldError(undefined);
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
        {submitting ? "Sending…" : forgotPage.submit}
      </Button>
    </form>
  );
}
