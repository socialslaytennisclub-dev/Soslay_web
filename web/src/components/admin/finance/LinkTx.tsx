"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { useConfirm } from "@/components/admin/ui/ConfirmDialog";
import { formatRupiah } from "@/lib/format";
import { shortDate, PAYMENT_KIND_LABEL } from "@/lib/trips";
import { toast } from "@/components/admin/ui/Toaster";
import type { ActionResult } from "@/server/admin/actions/common";
import { linkTransactions, previewTripSync, syncSessionFinance, syncTripFinance } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";

/** "Kaitkan transaksi" di detail event (12w) / detail trip: pilih transaksi yang belum terkait sesi / trip. */
export function LinkTxButton({ sessionId, tripId, candidates }: { sessionId?: string; tripId?: string; candidates: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  return (
    <>
      <AdminButton icon="link-simple" onClick={() => setOpen(true)}>
        Kaitkan transaksi
      </AdminButton>
      <FinanceModal open={open} onClose={() => setOpen(false)} title="Kaitkan transaksi" subtitle={tripId ? "Transaksi belum terkait sesi / trip, sejak 120 hari sebelum trip sampai 45 hari sesudahnya." : "Transaksi belum terkait sesi, ±45 hari dari tanggal event."}
        footer={
          <>
          <span className={styles.footNote}>{picked.length} dipilih</span>
          <AdminButton
            variant="primary"
            disabled={!picked.length || pending}
            onClick={() =>
              start(async () => {
                // Satu aksi untuk semua yang dipilih — aksi itu sendiri me-refresh halaman.
                const r = await linkTransactions(picked, tripId ? { tripId } : { sessionId: sessionId ?? null });
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                setPicked([]);
                setOpen(false);
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

/** Tombol sinkron bersama: `run` mengembalikan hasil aksi, atau null kalau dibatalkan admin. */
function SyncButton({ label, run, dialog }: { label: string; run: () => Promise<ActionResult | null>; dialog?: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <AdminButton
        icon="arrows-clockwise"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await run();
            if (!r) return;
            toast.result(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Menyinkronkan…" : label}
      </AdminButton>
      {dialog}
    </>
  );
}

/**
 * "Sync" di detail event: baca ulang pemasukan peserta dari activity (jalur Kuyy / manual, nominal, nama)
 * — untuk perubahan di activity sesudah activity selesai.
 */
export function SyncSessionButton({ sessionId }: { sessionId: string }) {
  return <SyncButton label="Sync" run={() => syncSessionFinance(sessionId)} />;
}


/**
 * "Sync ke Keuangan" untuk pembayaran paket trip (halaman trip & transaksi trip di Keuangan). Pratinjau
 * dulu: pembayaran sebelum go-live bisa saja sudah masuk lewat import jurnal, dan Sync tidak bisa
 * mengenalinya — admin memeriksa daftarnya sebelum dicatat.
 */
export function SyncTripButton({ tripId }: { tripId: string }) {
  const [confirm, dialog] = useConfirm();
  const run = async (): Promise<ActionResult | null> => {
    const p = await previewTripSync(tripId);
    if (!p.ok) return p;
    const skipped = p.skippedDeleted ? ` ${p.skippedDeleted} transaksi yang pernah dihapus tidak dibuat ulang.` : "";
    if (!p.items.length && !p.corrections) return { ok: true, message: `Semua pembayaran trip sudah tercatat di Keuangan.${skipped}` };
    const total = p.items.reduce((s, i) => s + i.amount, 0);
    const ok = await confirm({
      title: p.items.length ? `Catat ${p.items.length} pembayaran trip (${formatRupiah(total)})?` : "Sinkronkan pembayaran trip?",
      body: (
        <>
          {p.items.length > 0 && (
            <ul className={styles.syncList}>
              {p.items.map((i, n) => (
                <li key={n}>
                  {PAYMENT_KIND_LABEL[i.kind as keyof typeof PAYMENT_KIND_LABEL] ?? i.kind} · {i.name} · <strong>{formatRupiah(i.amount)}</strong> · {shortDate(i.date)}
                </li>
              ))}
            </ul>
          )}
          {p.items.length > 0 && <p>Pastikan pembayaran ini BELUM masuk lewat import jurnal — kalau sudah, Keuangan jadi dobel.</p>}
          {p.corrections > 0 && <p>{p.corrections} koreksi (pembayaran dibatalkan / pindah akun).</p>}
          {skipped && <p>{skipped.trim()}</p>}
        </>
      ),
      confirmLabel: "Ya, catat",
    });
    return ok ? syncTripFinance(tripId, p.token) : null;
  };
  return <SyncButton label="Sync ke Keuangan" run={run} dialog={dialog} />;
}
