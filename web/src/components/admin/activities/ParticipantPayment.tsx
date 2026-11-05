"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useDialog } from "@/hooks/useDialog";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { amountDigits, amountDisplay } from "@/lib/finance/format";
import { updateParticipantPayment } from "@/server/admin/actions/play";
import type { SessionParticipant } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, PaymentBadge } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import { toast } from "../ui/Toaster";
import styles from "./SessionEditor.module.css";

type Payment = "paid" | "pending";
const OPTIONS: { value: Payment; label: string }[] = [
  { value: "paid", label: "Lunas" },
  { value: "pending", label: "Menunggu" },
];

/** Peserta impor Kuyy → nominal & status bayarnya bisa diubah admin. */
export const canEditPayment = (p: SessionParticipant) => p.source === "kuy" && p.amount !== null;

/**
 * Ubah nominal & status bayar peserta hasil impor Excel Kuyy. Nominal peserta lunas masuk Keuangan
 * (Tiket activity · Saldo Kuyy) begitu activity selesai; perubahan sesudahnya dicatat sebagai koreksi.
 * Pola sama dengan useConfirm: `[edit(peserta), drawer]`.
 */
export function useParticipantPayment(sessionId: string, finished: boolean): [(p: SessionParticipant) => void, ReactNode] {
  const dialog = useDialog();
  const router = useRouter();
  const [target, setTarget] = useState<SessionParticipant | null>(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<Payment>("paid");
  const [saving, start] = useTransition();

  const edit = (p: SessionParticipant) => {
    setTarget(p);
    setAmount(String(p.amount ?? 0));
    setPayment(p.payment === "pending" ? "pending" : "paid");
    dialog.open();
  };

  const save = () =>
    target &&
    start(async () => {
      const r = await updateParticipantPayment(sessionId, target.id, Number(amount || 0), payment);
      toast.result(r);
      if (r.ok) {
        dialog.close();
        router.refresh();
      }
    });

  const unchanged = target !== null && Number(amount || 0) === target.amount && payment === target.payment;

  const drawer = (
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
        <div className={styles.field}>
          <span className={styles.label}>Status bayar</span>
          <div className={styles.segmentWrap} role="radiogroup" aria-label="Status bayar">
            {OPTIONS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={payment === o.value} className={cx(styles.option, payment === o.value && styles.optionOn)} onClick={() => setPayment(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.muted}>
          <AdminIcon name="hand-coins" size={12} />{" "}
          {finished
            ? "Activity sudah selesai — perubahan langsung dicatat di Keuangan sebagai koreksi."
            : "Nominal peserta yang lunas masuk Keuangan (Tiket activity · Saldo Kuyy) setelah activity selesai."}
        </p>
      </div>
    </Drawer>
  );

  return [edit, drawer];
}

/** Sel "Bayar": badge status + nominal; peserta impor Kuyy bisa diklik untuk diubah. */
export function PaymentCell({ participant: p, onEdit }: { participant: SessionParticipant; onEdit: (p: SessionParticipant) => void }) {
  if (!canEditPayment(p)) return <PaymentBadge status={p.payment} />;
  return (
    <button type="button" className={styles.paymentEdit} onClick={() => onEdit(p)} title="Ubah nominal & status bayar" aria-label={`Ubah pembayaran ${p.name}`}>
      <PaymentBadge status={p.payment} />
      <span>{formatRupiahPlain(p.amount ?? 0)}</span>
      <AdminIcon name="pencil-simple" size={14} />
    </button>
  );
}
