"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { cx } from "@/lib/cx";
import { MONTHS } from "@/lib/finance/format";
import { saveTarget } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";

const show = (v: string) => (v ? Number(v).toLocaleString("id-ID") : "");
const digits = (v: string) => v.replace(/\D/g, "");

/** Admin / 12o — Ubah target laba: satu angka per tahun (dibagi rata) atau per bulan. */
export function TargetButton({ year, amount, monthly }: { year: number; amount: number; monthly: number[] | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [perMonth, setPerMonth] = useState(!!monthly);
  const [total, setTotal] = useState(String(amount || ""));
  const [months, setMonths] = useState<string[]>(monthly?.map(String) ?? Array.from({ length: 12 }, () => (amount ? String(Math.round(amount / 12)) : "")));
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <>
      <button type="button" className={styles.link} onClick={() => setOpen(true)}>
        <AdminIcon name="pencil-simple" size={14} /> Ubah
      </button>
      <dialog ref={ref} className={styles.modal} onClose={() => setOpen(false)} aria-label="Ubah target laba">
        <div className={styles.modalInner}>
          <div className={styles.modalHead}>
            <div>
              <h2 className={styles.panelTitle}>Target laba {year}</h2>
              <p className={styles.panelSub}>Progres = laba bersih tahun berjalan ÷ target.</p>
            </div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Tutup">
              <AdminIcon name="x" size={18} />
            </button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.segment}>
              <button type="button" className={cx(styles.segBtn, !perMonth && styles.segActive)} onClick={() => setPerMonth(false)}>
                Satu angka per tahun
              </button>
              <button type="button" className={cx(styles.segBtn, perMonth && styles.segActive)} onClick={() => setPerMonth(true)}>
                Per bulan
              </button>
            </div>
            {perMonth ? (
              <div className={styles.fieldRow}>
                {MONTHS.map((m, i) => (
                  <label key={m} className={styles.field}>
                    <span>{m}</span>
                    <span className={styles.money}>
                      <span>Rp</span>
                      <input className={styles.input} inputMode="numeric" value={show(months[i])} onChange={(e) => setMonths((list) => list.map((v, j) => (j === i ? digits(e.target.value) : v)))} />
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <label className={styles.field}>
                <span>Target laba bersih {year}</span>
                <span className={styles.money}>
                  <span>Rp</span>
                  <input className={styles.input} inputMode="numeric" value={show(total)} onChange={(e) => setTotal(digits(e.target.value))} />
                </span>
                <small>Dibagi rata per bulan untuk grafik.</small>
              </label>
            )}
          </div>
          <div className={styles.modalFoot}>
            <span className={styles.footNote}>Ditetapkan Super Admin · tercatat di log</span>
            <div className={styles.actions}>
              <AdminButton onClick={() => setOpen(false)}>Batal</AdminButton>
              <AdminButton
                variant="primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = perMonth ? await saveTarget(year, 0, months.map((v) => Number(v || 0))) : await saveTarget(year, Number(total || 0), null);
                    toast.result(r);
                    if (r.ok) {
                      setOpen(false);
                      router.refresh();
                    }
                  })
                }
              >
                Simpan target
              </AdminButton>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
