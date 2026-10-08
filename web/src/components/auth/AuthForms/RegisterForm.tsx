"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button, Checkbox, TextField } from "@/components/ui";
import { AFTER_AUTH, registerPage } from "@/content/auth";
import { compact, MIN_PASSWORD, required, validateEmail, validatePassword, validatePhone, type FieldErrors } from "@/lib/auth";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

type Field = "fullName" | "displayName" | "kuyId" | "birthDate" | "phone" | "email" | "password" | "consent";
type Values = Record<Exclude<Field, "consent">, string>;

const initialValues: Values = { fullName: "", displayName: "", kuyId: "", birthDate: "", phone: "", email: "", password: "" };

/**
 * Figma 25:1854 — form daftar: Nama Lengkap · Display Name + Kuy ID · Tanggal lahir + Phone ·
 * Email + Password · persetujuan · tombol arrow. Belum ada backend (siap diganti POST /api/auth/register).
 */
export function RegisterForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>(initialValues);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = compact<Field>({
      fullName: required(values.fullName, "Nama lengkap"),
      kuyId: required(values.kuyId, "Kuy ID"),
      phone: validatePhone(values.phone),
      email: validateEmail(values.email),
      password: validatePassword(values.password, true),
      consent: consent ? undefined : "Centang persetujuan untuk melanjutkan",
    });
    setErrors(next);
    if (Object.keys(next).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setSubmitting(true);
    router.push(AFTER_AUTH);
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <TextField
          label="Nama Lengkap"
          required
          autoComplete="name"
          placeholder="Nama lengkap kamu"
          value={values.fullName}
          error={errors.fullName}
          onChange={(event) => update("fullName", event.target.value)}
        />
        <div className={styles.grid}>
          <TextField
            label="Display Name"
            autoComplete="nickname"
            placeholder="Nama panggilan"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
          />
          <TextField
            label="Kuy ID"
            required
            placeholder="Username Kuy kamu"
            value={values.kuyId}
            error={errors.kuyId}
            onChange={(event) => update("kuyId", event.target.value)}
          />
          <TextField
            label="Date of Birth"
            type="date"
            icon="calendar-blank"
            autoComplete="bday"
            value={values.birthDate}
            onChange={(event) => update("birthDate", event.target.value)}
          />
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
            placeholder="nama@email.com"
            value={values.email}
            error={errors.email}
            onChange={(event) => update("email", event.target.value)}
          />
          <PasswordField
            label="Password"
            required
            autoComplete="new-password"
            placeholder={`Minimal ${MIN_PASSWORD} karakter`}
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
        <Button type="submit" variant="arrow" className={styles.submit} disabled={submitting}>
          {submitting ? "Memproses…" : registerPage.submit}
        </Button>
      </div>
    </form>
  );
}
