"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, TextField } from "@/components/ui";
import { loginPage } from "@/content/auth";
import { compact, validateEmail, validatePassword, type FieldErrors } from "@/lib/auth";
import { signIn } from "@/server/auth/actions";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

type Field = "email" | "password";

/**
 * Form Masuk → Supabase Auth (server action `signIn`). Tanpa env Supabase, action langsung
 * mengarahkan ke tujuan (mode demo). `next` = halaman asal, mis. /admin.
 */
export function LoginForm({ next }: { next?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const fieldErrors = compact<Field>({ email: validateEmail(values.email), password: validatePassword(values.password) });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    startSubmit(async () => {
      const result = await signIn(values.email.trim(), values.password, next);
      if (result?.error) setFormError(result.error);
    });
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="nama@email.com"
          value={values.email}
          error={errors.email}
          onChange={(event) => update("email", event.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Password kamu"
          value={values.password}
          error={errors.password}
          onChange={(event) => update("password", event.target.value)}
        />
        <div className={styles.row}>
          <Checkbox checked={remember} onChange={setRemember} className={styles.checkbox}>
            {loginPage.remember}
          </Checkbox>
          <Link href={loginPage.forgot.href} className={styles.link}>
            {loginPage.forgot.label}
          </Link>
        </div>
      </div>

      {formError && (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" variant="arrow" className={styles.submit} disabled={submitting}>
        {submitting ? "Memproses…" : loginPage.submit}
      </Button>
    </form>
  );
}
