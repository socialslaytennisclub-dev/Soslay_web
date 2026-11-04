"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { linkTransaction } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";

/** "Kaitkan transaksi" di detail event (12w): pilih transaksi yang belum terkait sesi. */
export function LinkTxButton({ sessionId, candidates }: { sessionId: string; candidates: { id: string; label: string }[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <>
      <AdminButton icon="link-simple" onClick={() => setOpen(true)}>
        Kaitkan transaksi
      </AdminButton>
      <dialog ref={ref} className={styles.modal} onClose={() => setOpen(false)} aria-label="Kaitkan transaksi">
        <div className={styles.modalInner}>
          <div className={styles.modalHead}>
            <div>
              <h2 className={styles.panelTitle}>Kaitkan transaksi</h2>
              <p className={styles.panelSub}>Transaksi belum terkait sesi, ±45 hari dari tanggal event.</p>
            </div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Tutup">
              <AdminIcon name="x" size={18} />
            </button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.boxList}>
              {candidates.map((c) => (
                <label key={c.id} className={styles.settingRow}>
                  <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                  <div>{c.label}</div>
                </label>
              ))}
              {!candidates.length && <p className={styles.settingRow}>Tidak ada transaksi yang bisa dikaitkan.</p>}
            </div>
          </div>
          <div className={styles.modalFoot}>
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
          </div>
        </div>
      </dialog>
    </>
  );
}
