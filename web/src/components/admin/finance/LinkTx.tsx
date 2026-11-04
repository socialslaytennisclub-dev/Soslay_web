"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { linkTransaction } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";

/** "Kaitkan transaksi" di detail event (12w): pilih transaksi yang belum terkait sesi. */
export function LinkTxButton({ sessionId, candidates }: { sessionId: string; candidates: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  return (
    <>
      <AdminButton icon="link-simple" onClick={() => setOpen(true)}>
        Kaitkan transaksi
      </AdminButton>
      <FinanceModal open={open} onClose={() => setOpen(false)} title="Kaitkan transaksi" subtitle="Transaksi belum terkait sesi, ±45 hari dari tanggal event."
        footer={
          <>
          <span className={styles.footNote}>{picked.length} dipilih</span>
          <AdminButton
            variant="primary"
            disabled={!picked.length || pending}
            onClick={() =>
              start(async () => {
                for (const id of picked) {
                  const r = await linkTransaction(id, sessionId);
                  if (!r.ok) return toast.error(r.error);
                }
                toast.success(`${picked.length} transaksi dikaitkan.`);
                setPicked([]);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Kaitkan
          </AdminButton>
          </>
        }
      >
        <div className={styles.boxList}>
          {candidates.map((c) => (
            <label key={c.id} className={styles.settingRow}>
              <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
              <div>{c.label}</div>
            </label>
          ))}
          {!candidates.length && <p className={styles.settingRow}>Tidak ada transaksi yang bisa dikaitkan.</p>}
        </div>
      </FinanceModal>
    </>
  );
}
