"use client";

import { useRouter } from "next/navigation";
import { useImperativeHandle, useRef, useState, useTransition, type ReactNode, type Ref } from "react";
import { useDialog } from "@/hooks/useDialog";
import { formatRupiahPlain, PARTICIPANT_SOURCE_LABEL, PAYMENT_CHANNEL_LABEL, PAYMENT_LABEL } from "@/lib/admin-labels";
import { changedPhoneError, localPhone } from "@/lib/wa-invite";
import { amountDigits, amountDisplay } from "@/lib/finance/format";
import { updateParticipantPayment } from "@/server/admin/actions/play";
import type { SessionParticipant } from "@/server/admin/types";
import { SingleChips } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, PaymentBadge } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import { toast } from "../ui/Toaster";
import styles from "./SessionEditor.module.css";

type Payment = "paid" | "pending";
type Via = NonNullable<SessionParticipant["editablePayment"]>["via"];
const PAYMENT_OPTIONS = (["paid", "pending"] as const).map((value) => ({ value, label: PAYMENT_LABEL[value] }));
const VIA_OPTIONS = (["kuy", "manual"] as const).map((value) => ({ value, label: PAYMENT_CHANNEL_LABEL[value] }));

/** Kolom "Via": peserta file Kuyy & tambahan admin → jalur bayarnya (Kuy / Manual); lainnya → asal peserta. */
export const viaLabel = (p: SessionParticipant) => (p.editablePayment ? PAYMENT_CHANNEL_LABEL[p.editablePayment.via] : PARTICIPANT_SOURCE_LABEL[p.source]);

type PaymentDrawerHandle = { open: (p: SessionParticipant) => void };

/**
 * Drawer "Ubah pembayaran" peserta impor Kuyy & tambahan admin; tamu (belum member) juga bisa diganti
 * nama & nomor HP-nya. State form tinggal di sini (bukan di editor sesi)
 * supaya mengetik nominal tidak merender ulang seluruh halaman. Nominal peserta lunas masuk Keuangan begitu
 * activity selesai; perubahan sesudahnya dicatat sebagai koreksi.
 */
function PaymentDrawer({ sessionId, finished, ref }: { sessionId: string; finished: boolean; ref: Ref<PaymentDrawerHandle> }) {
  const dialog = useDialog();
  const router = useRouter();
  const [target, setTarget] = useState<SessionParticipant | null>(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<Payment>("paid");
  const [via, setVia] = useState<Via>("kuy");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, start] = useTransition();
  const openDialog = dialog.open;

  useImperativeHandle(
    ref,
    () => ({
      open(p) {
        if (!p.editablePayment) return;
        setTarget(p);
        setAmount(String(p.editablePayment.amount));
        setPayment(p.payment === "pending" ? "pending" : "paid");
        setVia(p.editablePayment.via);
        setName(p.name);
        setPhone(p.phone);
        openDialog();
      },
    }),
    [openDialog],
  );

  const save = () =>
    target &&
    start(async () => {
      const r = await updateParticipantPayment(sessionId, target.id, { amount: Number(amount || 0), payment, via, ...(guest ? { name, phone } : {}) });
      toast.result(r);
      if (r.ok) {
        dialog.close();
        router.refresh();
      }
    });

  // Tamu (belum member) → nama & nomor HP ikut bisa diubah; member → hanya pembayaran (data dari profil).
  const guest = target !== null && !target.memberId;
  const phoneError = guest ? changedPhoneError(phone, target.phone) : null;
  const unchanged =
    target?.editablePayment != null &&
    Number(amount || 0) === target.editablePayment.amount &&
    payment === target.payment &&
    via === target.editablePayment.via &&
    (!guest || (name.trim() === target.name && localPhone(phone) === localPhone(target.phone)));

  return (
    <Drawer
      dialogRef={dialog.dialogRef}
      title="Ubah pembayaran"
      subtitle={target ? `${target.name} · ${target.source === "admin" ? "tambahan admin" : "impor Kuyy"}${guest ? " · belum member" : ""}` : undefined}
      onClose={dialog.close}
      onBackdropClick={dialog.onBackdropClick}
      footer={
        <>
          <AdminButton onClick={dialog.close}>Batal</AdminButton>
          <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || unchanged || Boolean(phoneError) || (guest && !name.trim())}>
            {saving ? "Menyimpan…" : "Simpan"}
          </AdminButton>
        </>
      }
    >
      <div className={styles.paymentForm}>
        {guest && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Nama</span>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nama peserta" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Nomor HP (WhatsApp)</span>
              <input className={styles.input} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" aria-label="Nomor HP peserta" />
              {phoneError && <span className={styles.error}>{phoneError}</span>}
            </label>
          </>
        )}
        <label className={styles.field}>
          <span className={styles.label}>Nominal</span>
          <span className={styles.affix}>
            <span className={styles.muted}>Rp</span>
            <input inputMode="numeric" value={amountDisplay(amount)} onChange={(e) => setAmount(amountDigits(e.target.value))} aria-label="Nominal bayar" />
          </span>
        </label>
        <SingleChips label="Status bayar" options={PAYMENT_OPTIONS} value={payment} onChange={setPayment} />
        <SingleChips label="Via" options={VIA_OPTIONS} value={via} onChange={setVia} />
        <p className={styles.muted}>
          <AdminIcon name="hand-coins" size={12} />{" "}
          Masuk Keuangan sebagai Tiket activity ke {via === "kuy" ? "Saldo Kuyy" : "akun bayar manual (bawaan: Bank BCA, atur di Pengaturan Keuangan)"}
          {finished ? " — activity sudah selesai, perubahan langsung dicatat sebagai koreksi." : " setelah activity selesai, bila lunas."}
        </p>
      </div>
    </Drawer>
  );
}

/** Pola sama dengan useConfirm: `[edit(peserta), drawer]`. */
export function useParticipantPayment(sessionId: string, finished: boolean): [(p: SessionParticipant) => void, ReactNode] {
  const ref = useRef<PaymentDrawerHandle>(null);
  return [(p) => ref.current?.open(p), <PaymentDrawer key="payment-drawer" ref={ref} sessionId={sessionId} finished={finished} />];
}

/** Sel "Bayar": badge status + nominal (peserta file Kuyy & tambahan admin). Diubah lewat menu ⋮ → Ubah pembayaran. */
export function PaymentCell({ participant: p }: { participant: SessionParticipant }) {
  if (!p.editablePayment || (p.source === "admin" && !p.editablePayment.amount)) return <PaymentBadge status={p.payment} />;
  return (
    <span className={styles.paymentCell}>
      <PaymentBadge status={p.payment} />
      <span>{formatRupiahPlain(p.editablePayment.amount)}</span>
    </span>
  );
}
