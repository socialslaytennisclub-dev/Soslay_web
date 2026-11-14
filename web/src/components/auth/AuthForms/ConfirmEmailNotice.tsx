"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button, EmailSuggestion, TextField } from "@/components/ui";
import { registerPage } from "@/content/auth";
import { validateNewEmail, type FieldErrors } from "@/lib/auth";
import { changeSignupEmail, resendSignupConfirmation } from "@/server/auth/actions";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

type Field = "email" | "password";

/**
 * Layar "Check your email" setelah daftar + "Wrong email? Change it": member memperbaiki email
 * yang salah ketik sendiri (wajib password saat daftar), lalu link konfirmasi dikirim ulang.
 */
export function ConfirmEmailNotice({ email, onChanged }: { email: string; onChanged: (email: string) => void }) {
  const copy = registerPage.confirm;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const emailError = validateNewEmail(values.email) ?? (values.email.trim().toLowerCase() === email ? copy.sameEmail : undefined);
    const next = { email: emailError, password: values.password ? undefined : copy.passwordRequired };
    setErrors(next);
    if (next.email || next.password) return;
    startTransition(async () => {
      const result = await changeSignupEmail(email, values.email, values.password);
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.error) setFormError(result.error);
      if (result.confirmEmail) {
        onChanged(result.confirmEmail);
        setEditing(false);
        setValues({ email: "", password: "" });
        setNotice(result.resendFailed ? copy.changedNotSent : copy.changed);
      }
    });
  }

  function resend() {
    startTransition(async () => {
      const result = await resendSignupConfirmation(email);
      setNotice(result.sent ? copy.resent : (result.error ?? null));
    });
  }

  return (
    <div className={styles.confirm}>
      <div role="status">
        <p className={styles.confirmTitle}>{copy.title}</p>
        <p>{copy.text(email)}</p>
      </div>
      <p className={styles.confirmNotice} role="status">
        {notice}
      </p>

      {editing ? (
        <form className={styles.changeEmail} onSubmit={submit} noValidate>
          <div className={styles.fieldWrap}>
            <TextField
              label="Correct email"
              required
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={values.email}
              error={errors.email}
              onChange={(event) => update("email", event.target.value)}
            />
            <EmailSuggestion email={values.email} onAccept={(value) => update("email", value)} />
          </div>
          <PasswordField
            label="Password you just created"
            required
            autoComplete="current-password"
            value={values.password}
            error={errors.password}
            onChange={(event) => update("password", event.target.value)}
          />
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
          <div className={styles.confirmActions}>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : copy.changeSubmit}
            </Button>
            <button type="button" className={styles.inlineAction} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.inlineAction}
            onClick={() => {
              setNotice(null);
              setEditing(true);
            }}
          >
            {copy.change}
          </button>
          <button type="button" className={styles.inlineAction} onClick={resend} disabled={pending}>
            {pending ? "Sending…" : copy.resend}
          </button>
        </div>
      )}
    </div>
  );
}
