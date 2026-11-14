"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { EmailSuggestion, TextField } from "@/components/ui";
import { useDialog } from "@/hooks/useDialog";
import { adminEmailError } from "@/lib/auth";
import { changeMemberLoginEmail } from "@/server/admin/actions/members";
import type { LoginEmailStatus } from "@/server/admin/login-email";
import { AdminButton, Badge } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import styles from "./Members.module.css";
import { toast } from "../ui/Toaster";

/**
 * Tombol "Ganti email login & kirim ulang konfirmasi" di detail member (izin members edit).
 * Untuk email salah ketik saat daftar (mis. gmail.con): email Auth + profil diganti; akun belum
 * terkonfirmasi menerima link konfirmasi baru, akun terkonfirmasi tetap terkonfirmasi.
 */
export function ChangeLoginEmailButton({ memberId, profileEmail, status }: { memberId: string; profileEmail: string; status: LoginEmailStatus }) {
  const router = useRouter();
  const dialog = useDialog();
  const formId = useId();
  const currentEmail = status?.email || profileEmail;
  const [email, setEmail] = useState(currentEmail);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const error = touched ? adminEmailError(email) : undefined;
  const unchanged = email.trim().toLowerCase() === currentEmail.toLowerCase();
  const resendOnly = unchanged && status?.confirmed === false;
  /** Email login sudah benar tapi email profil belum (sisa kegagalan sebelumnya) → simpan = samakan profil. */
  const profileSync = unchanged && profileEmail.toLowerCase() !== currentEmail.toLowerCase();
  const blocked = unchanged && !resendOnly && !profileSync;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (adminEmailError(email) || blocked) return;
    startTransition(async () => {
      const result = await changeMemberLoginEmail(memberId, email);
      if (!result.ok) return toast.error(result.error);
      toast.success(result.message);
      dialog.close();
      router.refresh();
    });
  }

  return (
    <>
      <AdminButton
        icon="arrows-clockwise"
        onClick={() => {
          setEmail(currentEmail);
          setTouched(false);
          dialog.open();
        }}
      >
        Ganti email login
      </AdminButton>
      <Drawer
        dialogRef={dialog.dialogRef}
        title="Ganti email login & kirim ulang konfirmasi"
        subtitle="Untuk email yang salah ketik saat daftar. Email login dan email profil diganti bersamaan."
        onClose={dialog.close}
        onBackdropClick={dialog.onBackdropClick}
        footer={
          <>
            <AdminButton onClick={dialog.close}>Batal</AdminButton>
            <AdminButton variant="primary" type="submit" form={formId} icon="envelope-simple" disabled={pending || blocked}>
              {pending ? "Menyimpan…" : profileSync && !resendOnly ? "Samakan email profil" : resendOnly ? "Kirim ulang konfirmasi" : status?.confirmed ? "Ganti email login" : status ? "Ganti & kirim ulang konfirmasi" : "Ganti email login"}
            </AdminButton>
          </>
        }
      >
        <form id={formId} className={styles.addForm} onSubmit={submit} noValidate>
          <p className={styles.loginEmailNow}>
            Email login sekarang: <strong>{currentEmail || "—"}</strong>{" "}
            {status ? (
              <Badge tone={status.confirmed ? "lime" : "pink"} dot>
                {status.confirmed ? "Terkonfirmasi" : "Belum konfirmasi"}
              </Badge>
            ) : (
              <Badge tone="neutral">Status tidak diketahui</Badge>
            )}
          </p>
          <div>
            <TextField label="Email login baru" required type="email" value={email} error={error} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} placeholder="nama@email.com" autoComplete="off" />
            <EmailSuggestion email={email} prompt="Maksudnya" onAccept={setEmail} />
          </div>
          <p className={styles.loginEmailHelp}>
            {!status
              ? "Akun belum terkonfirmasi → link konfirmasi baru dikirim ke email baru. Sudah terkonfirmasi → email diganti dan tetap terkonfirmasi."
              : status.confirmed
                ? "Akun sudah terkonfirmasi: email diganti dan tetap terkonfirmasi — member langsung masuk dengan email baru."
                : "Akun belum terkonfirmasi: setelah email diganti, link konfirmasi baru dikirim ke email baru. Biarkan email sama untuk hanya mengirim ulang."}
          </p>
        </form>
      </Drawer>
    </>
  );
}
