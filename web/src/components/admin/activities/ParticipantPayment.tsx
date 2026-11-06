"use client";

import { useRouter } from "next/navigation";
import { useImperativeHandle, useRef, useState, useTransition, type ReactNode, type Ref } from "react";
import { useDialog } from "@/hooks/useDialog";
import { formatRupiahPlain, PARTICIPANT_SOURCE_LABEL, PAYMENT_CHANNEL_LABEL, PAYMENT_LABEL } from "@/lib/admin-labels";
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
type Via = NonNullable<SessionParticipant["kuyPayment"]>["via"];
const PAYMENT_OPTIONS = (["paid", "pending"] as const).map((value) => ({ value, label: PAYMENT_LABEL[value] }));
const VIA_OPTIONS = (["kuy", "manual"] as const).map((value) => ({ value, label: PAYMENT_CHANNEL_LABEL[value] }));

/** Kolom "Via": peserta file Kuyy → jalur bayarnya (Kuy / Manual); lainnya → asal peserta. */
export const viaLabel = (p: SessionParticipant) => (p.kuyPayment ? PAYMENT_CHANNEL_LABEL[p.kuyPayment.via] : PARTICIPANT_SOURCE_LABEL[p.source]);

type PaymentDrawerHandle = { open: (p: SessionParticipant) => void };

/**
 * Drawer "Ubah pembayaran" peserta hasil impor Excel Kuyy. State form tinggal di sini (bukan di editor sesi)
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
  const [saving, start] = useTransition();
  const openDialog = dialog.open;

  useImperativeHandle(
    ref,
    () => ({
      open(p) {
        if (!p.kuyPayment) return;
        setTarget(p);
        setAmount(String(p.kuyPayment.amount));
        setPayment(p.payment === "pending" ? "pending" : "paid");
        setVia(p.kuyPayment.via);
        openDialog();
      },
    }),
    [openDialog],
  );

  const save = () =>
    target &&
    start(async () => {
      const r = await updateParticipantPayment(sessionId, target.id, Number(amount || 0), payment, via);
      toast.result(r);
      if (r.ok) {
        dialog.close();
        router.refresh();
      }
    });

  const unchanged = target?.kuyPayment != null && Number(amount || 0) === target.kuyPayment.amount && payment === target.payment && via === target.kuyPayment.via;

  return (
    <Drawer
      dialogRef={dialog.dialogRef}
      title="Ubah pembayaran"
      subtitle={target ? `${target.name} · impor Kuyy` : undefined}
      onClose={dialog.close}
      onBackdropClick={dialog.onBackdropClick}
      footer={
        <>
          <AdminButton onClick={dialog.close}>Batal</AdminButton>
          <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || unchanged}>
            {saving ? "Menyimpan…" : "Simpan"}
          </AdminButton>
        </>
      }
    >
      <div className={styles.paymentForm}>
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

/** Sel "Bayar": badge status + nominal (peserta file Kuyy). Diubah lewat menu ⋮ → Ubah pembayaran. */
export function PaymentCell({ participant: p }: { participant: SessionParticipant }) {
  if (!p.kuyPayment) return <PaymentBadge status={p.payment} />;
  return (
    <span className={styles.paymentCell}>
      <PaymentBadge status={p.payment} />
      <span>{formatRupiahPlain(p.kuyPayment.amount)}</span>
    </span>
  );
}
