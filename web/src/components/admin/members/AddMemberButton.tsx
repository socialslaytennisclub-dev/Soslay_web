"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { SelectField, TextField } from "@/components/ui";
import { cityOptions } from "@/content/member";
import { useDialog } from "@/hooks/useDialog";
import { LEVEL_LABEL } from "@/lib/admin-labels";
import { phoneFormatError, PUBLIC_SITE_URL, signupWaLink } from "@/lib/wa-invite";
import { addMember, type NewMemberInput } from "@/server/admin/actions/members";
import type { TennisLevel } from "@/server/admin/types";
import { AdminButton } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import styles from "./Members.module.css";
import { toast } from "../ui/Toaster";

const EMPTY: NewMemberInput = { fullName: "", email: "", phone: "", kuyId: "", city: "", level: "" };
const LEVELS = Object.entries(LEVEL_LABEL) as [TennisLevel, string][];

/** Tombol "Tambah member" + form di panel samping (kanan) → akun member dibuat lewat email undangan. */
export function AddMemberButton() {
  const router = useRouter();
  const dialog = useDialog();
  const [form, setForm] = useState(EMPTY);
  const [pending, startTransition] = useTransition();
  /** Email undangan gagal → data tersimpan sebagai calon member; admin mengundang daftar lewat WhatsApp. */
  const [signupInvite, setSignupInvite] = useState<{ name: string; phone: string } | null>(null);
  /** Error nomor tampil setelah kolom ditinggalkan (blur) atau saat submit — bukan di setiap ketikan. */
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneError = phoneFormatError(form.phone) ?? undefined;
  const formId = useId();
  const set = (key: keyof NewMemberInput, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setPhoneTouched(true);
    if (phoneError) return;
    startTransition(async () => {
      const result = await addMember(form);
      if (!result.ok) return toast.error(result.error);
      if ("signupInvite" in result) setSignupInvite(result.signupInvite);
      toast.success(result.message);
      setForm(EMPTY);
      setPhoneTouched(false);
      router.refresh();
    });
  }

  return (
    <>
      <AdminButton
        variant="primary"
        icon="user-plus"
        onClick={() => {
          setSignupInvite(null);
          dialog.open();
        }}
      >
        Tambah member
      </AdminButton>
      <Drawer
        dialogRef={dialog.dialogRef}
        title="Tambah member"
        subtitle="Member menerima email undangan untuk membuat password, lalu bisa langsung masuk ke akunnya."
        onClose={dialog.close}
        onBackdropClick={dialog.onBackdropClick}
        footer={
          <>
            <AdminButton onClick={dialog.close}>Tutup</AdminButton>
            <AdminButton variant="primary" type="submit" form={formId} icon="envelope-simple" disabled={pending}>
              {pending ? "Mengirim undangan…" : "Tambah & kirim undangan"}
            </AdminButton>
          </>
        }
      >
        <form id={formId} className={styles.addForm} onSubmit={submit} noValidate>
          <TextField label="Nama lengkap" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />
          <TextField label="Email" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@email.com" autoComplete="off" />
          <div className={styles.addGrid}>
            <TextField label="No. WhatsApp" prefix="+62" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="812 3456 7890" onBlur={() => setPhoneTouched(true)} error={phoneTouched ? phoneError : undefined} />
            <TextField label="Kuy ID" value={form.kuyId} onChange={(e) => set("kuyId", e.target.value)} placeholder="username Kuy" />
            <SelectField label="Kota" options={cityOptions} value={form.city} placeholder="Pilih kota" onChange={(v) => set("city", v)} />
            <SelectField
              label="Level"
              options={LEVELS.map(([, label]) => label)}
              value={LEVEL_LABEL[form.level as TennisLevel] ?? ""}
              placeholder="Pilih level"
              onChange={(label) => set("level", LEVELS.find(([, l]) => l === label)?.[0] ?? "")}
            />
          </div>
        </form>
        {signupInvite && <SignupInvite {...signupInvite} />}
      </Drawer>
    </>
  );
}

function SignupInvite({ name, phone }: { name: string; phone: string }) {
  const wa = signupWaLink({ name, phone });
  return (
    <div className={styles.activation} role="status">
      <strong>Email undangan untuk {name} gagal terkirim.</strong>
      <span>
        Datanya sudah disimpan sebagai calon member. Minta dia daftar di website dengan email / nomor yang sama — riwayatnya otomatis tersambung ke akunnya.
      </span>
      {wa ? (
        <div className={styles.activationActions}>
          <AdminButton size="sm" variant="primary" icon="whatsapp-logo" href={wa} target="_blank">
            Undang daftar via WhatsApp
          </AdminButton>
        </div>
      ) : (
        <span>Tidak ada nomor WhatsApp — kirim link {PUBLIC_SITE_URL}/daftar secara manual.</span>
      )}
    </div>
  );
}
