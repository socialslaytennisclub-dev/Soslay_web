"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { pinWithin } from "@/animations";
import { Avatar, Button, Checkbox, ChoiceChips, SelectField, TextField } from "@/components/ui";
import {
  cityOptions,
  eventTypeOptions,
  genderOptions,
  handOptions,
  lookingForOptions,
  memberProfile,
  playingDurationOptions,
  playingFormatOptions,
  playingFrequencyOptions,
  profilePage,
  profileSections,
  tennisLevelOptions,
  type MemberProfile,
  type ProfileField,
} from "@/content/member";
import { gsap, useGSAP } from "@/lib/gsap";
import { profileCompletion, validateProfile } from "@/lib/profile";
import { ProfileSummary } from "./ProfileSummary";
import styles from "./ProfileForm.module.css";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const [basic, tennis, community] = profileSections;

/**
 * Figma 25:2275 — form profil 3 section + panel kelengkapan.
 * Belum ada backend: "Simpan" memvalidasi lalu menyimpan ke state (siap diganti PATCH /api/me).
 */
export function ProfileForm() {
  const [saved, setSaved] = useState<MemberProfile>(memberProfile);
  const [profile, setProfile] = useState<MemberProfile>(memberProfile);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [photoError, setPhotoError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [changingPassword, setChangingPassword] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const completion = profileCompletion(profile);
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);

  // Panel kanan menempel saat scroll (desktop). setTimeout: tunggu ScrollSmoother dibuat MotionProvider (parent).
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1200px)", () => {
        let stop: (() => void) | undefined;
        const id = window.setTimeout(() => {
          if (asideRef.current && layoutRef.current) stop = pinWithin(asideRef.current, layoutRef.current);
        }, 0);
        return () => {
          window.clearTimeout(id);
          stop?.();
        };
      });
    },
    { scope: layoutRef },
  );

  // URL preview foto dilepas saat diganti / unmount.
  useEffect(() => {
    const photo = profile.photo;
    return () => {
      if (photo?.startsWith("blob:") && photo !== saved.photo) URL.revokeObjectURL(photo);
    };
  }, [profile.photo, saved.photo]);

  function update<K extends ProfileField>(field: K, value: MemberProfile[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus(undefined);
  }

  function toggleIn(field: "lookingFor" | "eventTypes", option: string, checked: boolean) {
    const values = profile[field];
    update(field, checked ? [...values, option] : values.filter((value) => value !== option));
  }

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return setPhotoError("Format harus JPG atau PNG.");
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError("Ukuran foto maksimal 2 MB.");
    setPhotoError(undefined);
    update("photo", URL.createObjectURL(file));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateProfile(profile);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      setStatus("Masih ada kolom yang perlu diperbaiki.");
      layoutRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setSaved(profile);
    setChangingPassword(false);
    setStatus(profilePage.saved);
  }

  function cancel() {
    setProfile(saved);
    setErrors({});
    setPhotoError(undefined);
    setChangingPassword(false);
    setStatus(undefined);
  }

  return (
    <div ref={layoutRef} className={styles.layout}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormCard id={basic.id} title={basic.title} subtitle={basic.subtitle}>
          <div className={styles.photoField}>
            <Avatar name={profile.fullName || profile.displayName || "?"} src={profile.photo} size={88} />
            <div className={styles.photoInfo}>
              <p className={styles.label}>Profile Photo</p>
              <p className={styles.hint}>{photoError ?? profilePage.photoHint}</p>
              <div className={styles.photoActions}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="visually-hidden"
                  tabIndex={-1}
                  onChange={(event) => {
                    choosePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button type="button" className={styles.outlineSmall} onClick={() => fileRef.current?.click()}>
                  Ganti foto
                </button>
                {profile.photo && (
                  <button type="button" className={styles.textButton} onClick={() => update("photo", null)}>
                    Hapus
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={styles.grid}>
            <TextField label="Full Name" required value={profile.fullName} error={errors.fullName} autoComplete="name" onChange={(e) => update("fullName", e.target.value)} />
            <TextField label="Display Name / Nickname" value={profile.displayName} autoComplete="nickname" onChange={(e) => update("displayName", e.target.value)} />
            <TextField label="Date of Birth" type="date" icon="calendar-blank" value={profile.birthDate} autoComplete="bday" onChange={(e) => update("birthDate", e.target.value)} />
            <SelectField label="Gender" options={genderOptions} value={profile.gender} placeholder="Pilih gender" onChange={(value) => update("gender", value)} />
            <TextField label="Phone Number / WhatsApp" required prefix="+62" type="tel" inputMode="tel" autoComplete="tel-national" value={profile.phone} error={errors.phone} onChange={(e) => update("phone", e.target.value)} />
            <SelectField label="City / Location" required options={cityOptions} value={profile.city} placeholder="Pilih kota" error={errors.city} onChange={(value) => update("city", value)} />
            <TextField label="Kuy ID" required value={profile.kuyId} error={errors.kuyId} onChange={(e) => update("kuyId", e.target.value)} />
            <TextField label="Reclub ID" value={profile.reclubId} placeholder="Masukkan Reclub ID kamu" onChange={(e) => update("reclubId", e.target.value)} />
            <TextField label="Instagram" required prefix="@" value={profile.instagram} error={errors.instagram} onChange={(e) => update("instagram", e.target.value.replace(/^@/, ""))} />
            <TextField label="Email" required type="email" autoComplete="email" value={profile.email} error={errors.email} onChange={(e) => update("email", e.target.value)} />
            {changingPassword ? (
              <TextField label="Password baru" required type="password" autoComplete="new-password" minLength={8} placeholder="Minimal 8 karakter" />
            ) : (
              <TextField
                label="Password"
                required
                type="password"
                value="••••••••••"
                readOnly
                tabIndex={-1}
                action={
                  <button type="button" className={styles.inlineAction} onClick={() => setChangingPassword(true)}>
                    Ubah
                  </button>
                }
              />
            )}
          </div>
        </FormCard>

        <FormCard id={tennis.id} title={tennis.title} subtitle={tennis.subtitle}>
          <ChoiceChips label="Tennis Level" required options={tennisLevelOptions} value={profile.tennisLevel} error={errors.tennisLevel} onChange={(value) => update("tennisLevel", value)} />
          <ChoiceChips label="Playing Frequency" options={playingFrequencyOptions} value={profile.playingFrequency} onChange={(value) => update("playingFrequency", value)} />
          <div className={styles.grid}>
            <ChoiceChips label="Preferred Playing Format" options={playingFormatOptions} value={profile.playingFormat} onChange={(value) => update("playingFormat", value)} />
            <ChoiceChips label="Preferred Hand" options={handOptions} value={profile.hand} onChange={(value) => update("hand", value)} />
            <SelectField label="How long have you been playing tennis?" options={playingDurationOptions} value={profile.playingDuration} placeholder="Pilih durasi" onChange={(value) => update("playingDuration", value)} />
          </div>
        </FormCard>

        <FormCard id={community.id} title={community.title} subtitle={community.subtitle}>
          <Checklist label="What are you looking for?" options={lookingForOptions} values={profile.lookingFor} onToggle={(option, checked) => toggleIn("lookingFor", option, checked)} />
          <Checklist label="Preferred Event Type" options={eventTypeOptions} values={profile.eventTypes} onToggle={(option, checked) => toggleIn("eventTypes", option, checked)} />
        </FormCard>

        <div className={styles.actionsBar}>
          <p className={styles.label} role="status">
            {status ?? profilePage.requiredNote}
          </p>
          <div className={styles.actionButtons}>
            <Button variant="outline" onClick={cancel} disabled={!dirty}>
              Batal
            </Button>
            <Button type="submit" variant="primary">
              Simpan Perubahan
            </Button>
          </div>
        </div>
      </form>

      <div ref={asideRef} className={styles.aside}>
        <ProfileSummary percent={completion.percent} sections={completion.sections} />
      </div>
    </div>
  );
}

type FormCardProps = { id: string; title: string; subtitle: string; children: ReactNode };

function FormCard({ id, title, subtitle, children }: FormCardProps) {
  return (
    <section id={id} className={styles.card} aria-labelledby={`${id}-title`}>
      <header className={styles.cardHeader}>
        <h2 id={`${id}-title`} className={styles.cardTitle}>
          {title}
        </h2>
        <p className={styles.hint}>{subtitle}</p>
      </header>
      <div className={styles.fields}>{children}</div>
    </section>
  );
}

type ChecklistProps = {
  label: string;
  options: string[];
  values: string[];
  onToggle: (option: string, checked: boolean) => void;
};

function Checklist({ label, options, values, onToggle }: ChecklistProps) {
  return (
    <fieldset className={styles.checklist}>
      <legend className={styles.label}>{label}</legend>
      <p className={styles.hint}>{profilePage.multiHint}</p>
      <div className={styles.tiles}>
        {options.map((option) => (
          <Checkbox key={option} variant="tile" checked={values.includes(option)} onChange={(checked) => onToggle(option, checked)}>
            {option}
          </Checkbox>
        ))}
      </div>
    </fieldset>
  );
}
