"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { TextField } from "@/components/ui";
import { compact, isEmail, type FieldErrors } from "@/lib/auth";
import { signIn } from "@/server/auth/actions";
import { PasswordField } from "../AuthForms/PasswordField";
import styles from "./AdminLogin.module.css";

type Field = "email" | "password";

const ERRORS = {
  invalid_credentials: "Email atau password salah.",
  failed: "Gagal masuk. Coba lagi sebentar lagi.",
} as const;

/** Form login tim (bahasa Indonesia, gaya dashboard) → server action `signIn`, lalu ke /admin. */
export function AdminLoginForm({ next }: { next?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const target = next?.startsWith("/admin") ? next : "/admin";

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const email = values.email.trim();
    const fieldErrors = compact<Field>({
      email: !email ? "Email wajib diisi" : !isEmail(email) ? "Format email belum benar" : undefined,
      password: values.password ? undefined : "Password wajib diisi",
    });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    startSubmit(async () => {
      const result = await signIn(email, values.password, target);
      if (result) setFormError(ERRORS[result.code]);
    });
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label="Email tim"
        type="email"
        autoComplete="username"
        placeholder="nama@soslay.com"
        value={values.email}
        error={errors.email}
        onChange={(event) => update("email", event.target.value)}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        placeholder="Password akun tim"
        value={values.password}
        error={errors.password}
        onChange={(event) => update("password", event.target.value)}
      />

      {formError && (
        <p className={styles.formError} role="alert">
          <AdminIcon name="warning-circle" size={18} />
          {formError}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? "Memeriksa akun…" : "Masuk ke Dashboard"}
        {!submitting && <AdminIcon name="arrow-up-right" size={18} />}
      </button>
    </form>
  );
}
