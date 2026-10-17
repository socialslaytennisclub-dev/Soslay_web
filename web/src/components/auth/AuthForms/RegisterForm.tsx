"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, DateField, TextField } from "@/components/ui";
import { registerPage } from "@/content/auth";
import { compact, MIN_PASSWORD, required, todayIso, validateBirthDate, validateEmail, validatePassword, validatePhone, type FieldErrors } from "@/lib/auth";
import { signUp } from "@/server/auth/actions";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

type Field = "fullName" | "displayName" | "kuyId" | "birthDate" | "phone" | "email" | "password" | "consent";
type Values = Record<Exclude<Field, "consent">, string>;

const initialValues: Values = { fullName: "", displayName: "", kuyId: "", birthDate: "", phone: "", email: "", password: "" };

/**
 * Figma 25:1854 — form daftar: Nama Lengkap · Display Name + Kuy ID · Tanggal lahir + Phone ·
 * Email + Password · persetujuan · tombol arrow → server action `signUp` (Supabase Auth + profil member).
 */
export function RegisterForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>(initialValues);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const update = (field: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = compact<Field>({
      fullName: required(values.fullName, "Full name"),
      kuyId: required(values.kuyId, "Kuy ID"),
      birthDate: validateBirthDate(values.birthDate),
      phone: validatePhone(values.phone),
      email: validateEmail(values.email),
      password: validatePassword(values.password, true),
      consent: consent ? undefined : "Please agree to continue",
    });
    setErrors(next);
    if (Object.keys(next).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    startSubmit(async () => {
      const result = await signUp(values);
      if (result?.fieldErrors) {
        setErrors(result.fieldErrors);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      }
      if (result?.error) setFormError(result.error);
      if (result?.confirmEmail) setConfirmEmail(result.confirmEmail);
    });
  }

  if (confirmEmail) {
    return (
      <div className={styles.confirm} role="status">
        <p className={styles.confirmTitle}>{registerPage.confirm.title}</p>
        <p>{registerPage.confirm.text(confirmEmail)}</p>
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <TextField
          label="Full Name"
          required
          autoComplete="name"
          placeholder="Enter your full name"
          value={values.fullName}
          error={errors.fullName}
          onChange={(event) => update("fullName", event.target.value)}
        />
        <div className={styles.grid}>
          <TextField
            label="Display Name"
            autoComplete="nickname"
            placeholder="How should we call you?"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
          />
          <TextField
            label="Kuyy ID"
            required
            placeholder="Your Kuyy username"
            value={values.kuyId}
            error={errors.kuyId}
            onChange={(event) => update("kuyId", event.target.value)}
          />
          <DateField label="Date of Birth" autoComplete="bday" value={values.birthDate} error={errors.birthDate} onChange={(iso) => update("birthDate", iso)} max={todayIso()} />
          <TextField
            label="Phone Number"
            required
            prefix="+62"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="812 3456 7890"
            value={values.phone}
            error={errors.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
          <TextField
            label="Email"
            required
            type="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={values.email}
            error={errors.email}
            onChange={(event) => update("email", event.target.value)}
          />
          <PasswordField
            label="Password"
            required
            showStrength
            autoComplete="new-password"
            placeholder={`Minimum ${MIN_PASSWORD} characters`}
            value={values.password}
            error={errors.password}
            onChange={(event) => update("password", event.target.value)}
          />
        </div>
      </div>

      <div className={styles.footer}>
        <div>
          <Checkbox
            checked={consent}
            onChange={(checked) => {
              setConsent(checked);
              setErrors((current) => ({ ...current, consent: undefined }));
            }}
            className={styles.checkbox}
          >
            {registerPage.consent}
          </Checkbox>
          {errors.consent && <p className={styles.error}>{errors.consent}</p>}
        </div>
        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" variant="arrow" className={styles.submit} disabled={submitting}>
          {submitting ? "Processing…" : registerPage.submit}
        </Button>
      </div>
    </form>
  );
}
