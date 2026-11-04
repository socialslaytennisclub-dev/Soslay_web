"use client";

import { useEffect, useRef, useState } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import styles from "./Finance.module.css";

const REPORTS = [
  { key: "pnl", label: "Laba rugi", note: "Pendapatan, biaya & laba bersih" },
  { key: "balance", label: "Neraca", note: "Posisi aset, kewajiban & ekuitas" },
  { key: "transactions", label: "Daftar transaksi", note: "Semua transaksi dalam periode" },
  { key: "yearly", label: "Laba rugi tahunan", note: "Ringkasan per bulan" },
  { key: "journal", label: "Jurnal umum (debet / kredit)", note: "Untuk konsultan pajak · format sama dengan jurnal Excel lama" },
] as const;

/** Admin / 12q — Export laporan: pilih laporan, periode & format (PDF lewat halaman cetak). */
export function ExportButton({ month, preset = ["pnl", "balance"], label = "Export laporan" }: { month: string; preset?: string[]; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(preset);
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  const csvOk = picked.length === 1 && (picked[0] === "transactions" || picked[0] === "journal");
  const href = format === "pdf" ? `/admin/keuangan/cetak?reports=${picked.join(",")}&m=${month}` : `/admin/keuangan/export?reports=${picked.join(",")}&m=${month}&format=${format}`;

  return (
    <>
      <AdminButton icon="download-simple" onClick={() => setOpen(true)}>
        {label}
      </AdminButton>
      <dialog ref={ref} className={styles.modal} onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)} aria-label="Export laporan">
        <div className={styles.modalInner}>
          <div className={styles.modalHead}>
            <div>
              <h2 className={styles.panelTitle}>Export laporan</h2>
              <p className={styles.panelSub}>Periode {month} · header berisi nama klub, periode, waktu export & nama pengekspor.</p>
            </div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Tutup">
              <AdminIcon name="x" size={18} />
            </button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.boxList}>
              {REPORTS.map((r) => (
                <label key={r.key} className={styles.settingRow}>
                  <input type="checkbox" checked={picked.includes(r.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.key] : p.filter((x) => x !== r.key)))} />
                  <div>
                    {r.label}
                    <small>{r.note}</small>
                  </div>
                </label>
              ))}
            </div>
            <div className={styles.segment} role="radiogroup" aria-label="Format">
              {(
                [
                  ["pdf", "PDF (cetak)"],
                  ["xlsx", "Excel (.xlsx)"],
                  ["csv", "CSV"],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={format === v} disabled={v === "csv" && !csvOk} className={cx(styles.segBtn, format === v && styles.segActive)} onClick={() => setFormat(v)}>
                  {l}
                </button>
              ))}
            </div>
            <p className={styles.muted}>CSV khusus daftar transaksi atau jurnal (satu laporan). Bukti transaksi tidak ikut diekspor.</p>
          </div>
          <div className={styles.modalFoot}>
            <span />
            <div className={styles.actions}>
              <AdminButton onClick={() => setOpen(false)}>Batal</AdminButton>
              <AdminButton
                variant="primary"
                icon="download-simple"
                disabled={!picked.length || (format === "csv" && !csvOk)}
                onClick={() => {
                  window.open(href, format === "pdf" ? "_blank" : "_self");
                  setOpen(false);
                }}
              >
                Export
              </AdminButton>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
