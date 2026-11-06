"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton, PickerInput } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { amountDigits, amountDisplay, rp } from "@/lib/finance/format";
import { parseAmount } from "@/lib/finance/journal";
import type { BalanceItem, BalanceItemKey } from "@/lib/finance/types";
import { deleteBalanceItem, saveBalanceItem, saveOpeningBalances } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";

const KEYS: { key: BalanceItemKey; label: string; hint: string }[] = [
  { key: "capital", label: "Modal disetor", hint: "Setoran awal pemilik (ekuitas)" },
  { key: "retained_earnings_opening", label: "Laba ditahan awal", hint: "Akumulasi laba sebelum data dimulai" },
  { key: "equipment", label: "Peralatan", hint: "Harga beli — disusutkan garis lurus" },
  { key: "receivable", label: "Piutang", hint: "Mis. termin sponsor belum dibayar" },
  { key: "payable", label: "Utang usaha (vendor)", hint: "Tagihan vendor belum dibayar" },
  { key: "other_asset", label: "Aset lain", hint: "" },
  { key: "other_liability", label: "Kewajiban lain", hint: "" },
];
const digits = (v: string) => amountDigits(v, true);
const show = amountDisplay;

type Account = { id: string; name: string; openingBalance: number; openingDate: string };

/** Admin / 12n — Saldo awal akun & pos manual neraca (modal, peralatan, piutang, utang vendor). */
export function BalanceSetupButton({ accounts, items, autoOpen = false }: { accounts: Account[]; items: BalanceItem[]; autoOpen?: boolean }) {
  const router = useRouter();
  const initialOpening = () => Object.fromEntries(accounts.map((a) => [a.id, String(a.openingBalance)]));
  // Satu isian "Per tanggal" untuk semua akun, diawali tanggal akun pertama.
  const initialDate = accounts[0]?.openingDate ?? "2025-09-01";
  const [open, setOpen] = useState(autoOpen);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(initialOpening);
  const [openingDate, setOpeningDate] = useState(initialDate);
  const [form, setForm] = useState<{ id?: string; key: BalanceItemKey; label: string; amount: string; effectiveDate: string; salvage: string; lifeMonths: string; note: string } | null>(null);

  // Tanggal hanya dianggap berubah bila admin mengubah isiannya — akun lain boleh bertanggal beda.
  const dateChanged = openingDate !== initialDate;
  // Saldo awal akun yang diketik tapi belum disimpan.
  const changedAccounts = accounts.filter((a) => parseAmount(opening[a.id] ?? "") !== a.openingBalance || (dateChanged && openingDate !== a.openingDate));
  // Form pos manual yang sedang terbuka & sudah diisi.
  const formFilled = !!form && (!!form.id || parseAmount(form.amount) !== 0);
  const unsaved = changedAccounts.length > 0 || formFilled;

  /** Simpan saldo awal akun yang berubah dalam satu server action. */
  const persistOpening = async () => {
    if (!changedAccounts.length) return true;
    const r = await saveOpeningBalances(changedAccounts.map((a) => ({ accountId: a.id, amount: parseAmount(opening[a.id] ?? "") })), openingDate);
    if (!r.ok) toast.error(r.error);
    return r.ok;
  };

  const persistItem = async () => {
    if (!form) return true;
    const r = await saveBalanceItem({
      id: form.id,
      key: form.key,
      label: form.label,
      amount: parseAmount(form.amount),
      effectiveDate: form.effectiveDate,
      salvage: parseAmount(form.salvage),
      lifeMonths: parseAmount(form.lifeMonths),
      note: form.note,
    });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setForm(null);
    return true;
  };

  const saveOpening = () =>
    start(async () => {
      if (!changedAccounts.length) return toast.success("Tidak ada perubahan saldo awal.");
      const ok = await persistOpening();
      // Sebagian bisa sudah tersimpan walau ada yang gagal → tetap segarkan data.
      router.refresh();
      if (ok) toast.success("Saldo awal akun tersimpan.");
    });

  const saveItem = () =>
    start(async () => {
      if (!(await persistItem())) return;
      toast.success(`${form?.label ?? "Pos"} tersimpan.`);
      router.refresh();
    });

  // Tombol bawah ikut menyimpan isian yang belum disimpan — dulu "Selesai" hanya menutup jendela
  // sehingga angka yang diketik hilang tanpa pesan.
  const saveAndClose = () =>
    start(async () => {
      if (!unsaved) return setOpen(false);
      const openingOk = await persistOpening();
      const itemOk = openingOk && (!formFilled || (await persistItem()));
      // Refresh juga saat gagal sebagian, supaya yang sudah tersimpan tidak dianggap "belum disimpan".
      if (changedAccounts.length || (formFilled && itemOk)) router.refresh();
      if (!openingOk || !itemOk) return;
      toast.success("Saldo awal & penyesuaian tersimpan.");
      setOpen(false);
    });

  // Ditutup tanpa menyimpan (konfirmasinya di FinanceModal lewat `dirty`) → buang isian.
  const discardAndClose = () => {
    setOpening(initialOpening());
    setOpeningDate(initialDate);
    setForm(null);
    setOpen(false);
  };

  return (
    <>
      <AdminButton icon="pencil-simple" onClick={() => setOpen(true)}>
        Saldo awal & penyesuaian
      </AdminButton>
      <FinanceModal open={open} onClose={discardAndClose} dirty={unsaved} title="Saldo awal & penyesuaian" subtitle="Pos manual neraca. Semua perubahan tercatat di log." wide
        footer={
          <>
          <span className={styles.muted}>{unsaved ? "Ada isian yang belum disimpan." : ""}</span>
          <AdminButton variant="primary" disabled={pending} onClick={saveAndClose}>
            {unsaved ? "Simpan & tutup" : "Selesai"}
          </AdminButton>
          </>
        }
      >
        <h3 className={styles.panelTitle}>Saldo awal akun</h3>
        <label className={styles.field} style={{ maxWidth: 240 }}>
          <span>Per tanggal</span>
          <PickerInput type="date" className={styles.input} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </label>
        <div className={styles.boxList}>
          {accounts.map((a) => (
            <div key={a.id} className={styles.settingRow}>
              <div>{a.name}</div>
              <span className={styles.money} style={{ width: 200 }}>
                <span>Rp</span>
                <input className={styles.input} inputMode="numeric" aria-label={`Saldo awal ${a.name}`} value={show(opening[a.id] ?? "")} onChange={(e) => setOpening((o) => ({ ...o, [a.id]: digits(e.target.value) }))} />
              </span>
            </div>
          ))}
        </div>
        <div>
          <AdminButton size="sm" variant="primary" disabled={pending} onClick={saveOpening}>
            Simpan saldo awal
          </AdminButton>
        </div>

        <div className={styles.panelHead} style={{ marginBottom: 0, marginTop: 8 }}>
          <h3 className={styles.panelTitle}>Pos manual</h3>
          <AdminButton size="sm" icon="plus-bold" onClick={() => setForm({ key: "capital", label: "Modal disetor", amount: "", effectiveDate: openingDate, salvage: "", lifeMonths: "36", note: "" })}>
            Tambah pos
          </AdminButton>
        </div>
        {form && (
          <div className={styles.inlineForm}>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Jenis pos</span>
                <select className={styles.input} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value as BalanceItemKey, label: form.id ? form.label : (KEYS.find((k) => k.key === e.target.value)?.label ?? "") })}>
                  {KEYS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <small>{KEYS.find((k) => k.key === form.key)?.hint}</small>
              </label>
              <label className={styles.field}>
                <span>Nama / keterangan</span>
                <input className={styles.input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Jumlah</span>
                <span className={styles.money}>
                  <span>Rp</span>
                  <input className={styles.input} inputMode="numeric" value={show(form.amount)} onChange={(e) => setForm({ ...form, amount: digits(e.target.value) })} />
                </span>
              </label>
              <label className={styles.field}>
                <span>{form.key === "equipment" ? "Tanggal beli" : "Berlaku sejak"}</span>
                <PickerInput type="date" className={styles.input} value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
              </label>
            </div>
            {form.key === "equipment" && (
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Nilai sisa</span>
                  <span className={styles.money}>
                    <span>Rp</span>
                    <input className={styles.input} inputMode="numeric" value={show(form.salvage)} onChange={(e) => setForm({ ...form, salvage: digits(e.target.value) })} />
                  </span>
                </label>
                <label className={styles.field}>
                  <span>Masa manfaat (bulan)</span>
                  <input className={styles.input} inputMode="numeric" value={form.lifeMonths} onChange={(e) => setForm({ ...form, lifeMonths: digits(e.target.value) })} />
                  {parseAmount(form.lifeMonths) > 0 && parseAmount(form.amount) > 0 && <small>Penyusutan {rp(Math.round((parseAmount(form.amount) - parseAmount(form.salvage)) / parseAmount(form.lifeMonths)))} / bulan</small>}
                </label>
              </div>
            )}
            <div className={styles.actions}>
              <AdminButton size="sm" onClick={() => setForm(null)}>
                Batal
              </AdminButton>
              <AdminButton size="sm" variant="primary" disabled={pending} onClick={saveItem}>
                Simpan pos
              </AdminButton>
            </div>
          </div>
        )}
        <div className={styles.boxList}>
          {items.length === 0 && <p className={styles.settingRow}>Belum ada pos manual.</p>}
          {items.map((i) => (
            <div key={i.id} className={styles.settingRow}>
              <div>
                {i.label}
                <small>
                  {KEYS.find((k) => k.key === i.key)?.label} · sejak {i.effectiveDate}
                  {i.key === "equipment" ? ` · ${i.lifeMonths} bln, sisa ${rp(i.salvage)}` : ""}
                </small>
              </div>
              <strong>{rp(i.amount)}</strong>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Ubah ${i.label}`}
                onClick={() => setForm({ id: i.id, key: i.key, label: i.label, amount: String(i.amount), effectiveDate: i.effectiveDate, salvage: String(i.salvage), lifeMonths: String(i.lifeMonths || 36), note: i.note ?? "" })}
              >
                <AdminIcon name="pencil-simple" size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Hapus ${i.label}`}
                onClick={() =>
                  start(async () => {
                    const r = await deleteBalanceItem(i.id);
                    toast.result(r);
                    if (r.ok) router.refresh();
                  })
                }
              >
                <AdminIcon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className={styles.note}>Neraca seimbang bila saldo awal akun + peralatan + piutang = utang vendor + modal disetor + laba ditahan awal. Penarikan & setor modal setelahnya dicatat sebagai transaksi Modal pemilik.</p>
      </FinanceModal>
    </>
  );
}
