"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { Drawer } from "@/components/admin/ui/Drawer";
import { RowMenu } from "@/components/admin/ui/RowMenu";
import { toast } from "@/components/admin/ui/Toaster";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { dateLabel, rp, rpSigned } from "@/lib/finance/format";
import type { TxView } from "@/lib/finance/views";
import { deleteTransaction, restoreTransaction } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";
import { SourcePill } from "./FinanceUI";
import { TxModal, type TxFormOptions } from "./TxModal";


function Proof({ v }: { v: TxView }) {
  if (v.proof === "auto") return <AdminIcon name="link-simple" size={16} label="Bukti otomatis dari sistem" />;
  if (v.proof === "yes") return <AdminIcon name="image" size={16} label="Nota / struk terlampir" />;
  if (v.proof === "no") return <span className={cx(styles.pill, styles.pillPink)}>Belum</span>;
  return <span className={styles.muted}>—</span>;
}

/**
 * Tabel transaksi (12b / 12a "Transaksi terbaru"): menu baris (detail, ubah, duplikat, hapus),
 * drawer detail (12g manual · 12g-2 otomatis read-only), konfirmasi hapus + alasan (12l), toast Batalkan (12k).
 */
export function TxTable({ rows, options, compact = false, showProof = true, openId }: { rows: TxView[]; options?: TxFormOptions; compact?: boolean; showProof?: boolean; openId?: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TxView | null>(() => (openId ? (rows.find((r) => r.id === openId || r.tx.code === openId) ?? null) : null));
  const [edit, setEdit] = useState<{ view: TxView; duplicate: boolean } | null>(null);
  const [del, setDel] = useState<TxView | null>(null);
  const drawer = useDialog();

  // ?trx=… → drawer detail terbuka saat halaman dimuat.
  useEffect(() => {
    if (detail) drawer.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buka sekali dari ?trx=
  }, [openId]);

  const openDetail = (v: TxView) => {
    setDetail(v);
    drawer.open();
  };

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Keterangan</th>
              <th>Kategori</th>
              <th>Akun</th>
              <th>Sumber</th>
              {showProof && <th>Bukti</th>}
              <th className={styles.num}>Jumlah</th>
              {!compact && <th aria-label="Aksi" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.key} className={styles.clickable} onClick={() => openDetail(v)}>
                <td style={{ whiteSpace: "nowrap" }}>{v.dateLabel}</td>
                <td>
                  <span className={styles.cellTitle}>{v.title}</span>
                  {v.sub && <span className={cx(styles.cellSub, v.subWarn && styles.cellSubWarn)}>{v.sub}</span>}
                </td>
                <td>{v.category}</td>
                <td>{v.account}</td>
                <td>
                  <SourcePill tx={v} />
                </td>
                {showProof && (
                  <td>
                    <Proof v={v} />
                  </td>
                )}
                <td className={cx(styles.num, styles.strong, v.amount < 0 && styles.neg)}>{v.type === "transfer" ? rp(v.amount) : rpSigned(v.amount)}</td>
                {!compact && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      label={`Aksi ${v.code}`}
                      items={[
                        { label: "Lihat detail", icon: "eye", onSelect: () => openDetail(v) },
                        ...(v.editable && options
                          ? [
                              { label: "Ubah", icon: "pencil-simple" as const, onSelect: () => setEdit({ view: v, duplicate: false }) },
                              { label: "Duplikat", icon: "copy" as const, onSelect: () => setEdit({ view: v, duplicate: true }) },
                              { label: "Hapus", icon: "trash" as const, danger: true, onSelect: () => setDel(v) },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer
        dialogRef={drawer.dialogRef}
        title={detail ? (detail.grouped.length ? detail.title : detail.tx.code) : "Detail transaksi"}
        subtitle={detail ? (detail.editable ? "Transaksi manual" : detail.auto ? "Otomatis · read-only — koreksi lewat modul asalnya" : "Read-only") : undefined}
        onClose={drawer.close}
        onBackdropClick={drawer.onBackdropClick}
        footer={
          detail?.editable && options ? (
            <div className={styles.actions}>
              <AdminButton
                variant="outline"
                icon="trash"
                onClick={() => {
                  drawer.close();
                  setDel(detail);
                }}
              >
                Hapus
              </AdminButton>
              <AdminButton
                variant="primary"
                icon="pencil-simple"
                onClick={() => {
                  drawer.close();
                  setEdit({ view: detail, duplicate: false });
                }}
              >
                Ubah
              </AdminButton>
            </div>
          ) : undefined
        }
      >
        {detail && <Detail v={detail} />}
      </Drawer>

      {edit && options && <TxModal key={`${edit.view.key}-${edit.duplicate}`} open onClose={() => setEdit(null)} options={options} initial={edit.view.tx} duplicate={edit.duplicate} />}
      {del && (
        <DeleteDialog
          v={del}
          onClose={() => setDel(null)}
          onDone={() => {
            setDel(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Detail({ v }: { v: TxView }) {
  const t = v.tx;
  return (
    <div className={styles.stack}>
      <div>
        <p className={styles.muted}>{v.grouped.length ? "Total" : "Jumlah"}</p>
        <p className={cx(styles.detailAmount, v.amount < 0 && styles.neg)}>{v.type === "transfer" ? rp(v.amount) : rpSigned(v.amount)}</p>
      </div>
      <dl className={styles.dl}>
        <dt>Tanggal</dt>
        <dd>{dateLabel(t.date)}</dd>
        {t.recognizedOn !== t.date && (
          <>
            <dt>Diakui</dt>
            <dd>{dateLabel(t.recognizedOn)}</dd>
          </>
        )}
        <dt>Keterangan</dt>
        <dd>{t.description}</dd>
        <dt>Kategori</dt>
        <dd>{v.category}</dd>
        <dt>Akun</dt>
        <dd>{v.account}</dd>
        <dt>Sumber</dt>
        <dd>
          <SourcePill tx={v} />
        </dd>
        {t.counterparty && (
          <>
            <dt>Vendor / pembayar</dt>
            <dd>{t.counterparty}</dd>
          </>
        )}
        {t.ownerName && (
          <>
            <dt>Pemilik</dt>
            <dd>{t.ownerName}</dd>
          </>
        )}
        {t.term && (
          <>
            <dt>Termin</dt>
            <dd>{{ dp: "DP", installment: "Cicilan", settlement: "Pelunasan" }[t.term]}</dd>
          </>
        )}
        {v.sessionLabel && (
          <>
            <dt>Sesi / event</dt>
            <dd>
              <a className={styles.link} href={`/admin/keuangan/event/${v.sessionId}`}>
                {v.sessionLabel}
              </a>
            </dd>
          </>
        )}
        {t.note && (
          <>
            <dt>Catatan</dt>
            <dd>{t.note}</dd>
          </>
        )}
        <dt>Bukti</dt>
        <dd>
          {v.proof === "auto" ? (
            "Tautan sistem (tiket / order)"
          ) : t.hasProof ? (
            <a className={styles.link} href={`/admin/keuangan/bukti/${t.id}`} target="_blank" rel="noreferrer">
              {t.proofName ?? "Lihat bukti"}
            </a>
          ) : (
            <span className={cx(styles.pill, styles.pillPink)}>Belum</span>
          )}
        </dd>
        <dt>Dicatat</dt>
        <dd>{t.createdByName ?? (v.auto ? "Sistem" : "—")}</dd>
      </dl>
      {v.grouped.length > 0 && (
        <div className={styles.boxList}>
          {v.grouped.map((g, i) => (
            <div key={i} className={styles.settingRow}>
              <div>
                {g.name}
                <small>{dateLabel(g.date)}</small>
              </div>
              <strong className={g.amount < 0 ? styles.neg : undefined}>{rpSigned(g.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteDialog({ v, onClose, onDone }: { v: TxView; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <FinanceModal open={true} onClose={onClose} title={`Hapus ${v.tx.code}?`} subtitle={<>{v.title} · {rpSigned(v.amount)}</>}
      footer={
        <>
        <span />
        <div className={styles.actions}>
          <AdminButton variant="outline" onClick={onClose}>
            Batal
          </AdminButton>
          <AdminButton
            variant="primary"
            icon="trash"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteTransaction(v.id, reason);
                if (!r.ok) return toast.error(r.error);
                onDone();
                toast.withAction(r.message, {
                  label: "Batalkan",
                  onClick: async () => {
                    toast.result(await restoreTransaction(v.id));
                    router.refresh();
                  },
                });
              })
            }
          >
            {pending ? "Menghapus…" : "Hapus transaksi"}
          </AdminButton>
        </div>
        </>
      }
    >
      <p className={styles.note}>Saldo akun & laporan akan disesuaikan. Riwayat tetap tercatat di log dan kamu bisa membatalkan dalam 5 detik.</p>
      <label className={styles.field}>
        <span>
          Alasan <span className={styles.optional}>(opsional)</span>
        </span>
        <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. dobel input" />
      </label>
    </FinanceModal>
  );
}
