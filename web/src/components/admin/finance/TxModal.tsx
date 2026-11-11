"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton, PickerInput } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { cx } from "@/lib/cx";
import { amountDigits, amountDisplay } from "@/lib/finance/format";
import type { FinanceRole, FinTx, TxType } from "@/lib/finance/types";
import { deleteTransaction, saveTransaction, type TxFieldErrors } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";

export type TxFormOptions = {
  role: FinanceRole;
  userName: string;
  today: string;
  accounts: { id: string; name: string; systemKey: string | null }[];
  categories: { id: string; name: string; kind: "income" | "expense"; systemKey: string | null; archived: boolean }[];
  sessions: { id: string; label: string }[];
  /** Akun default per jenis (bank utama). */
  defaultAccountId: string | null;
};

const TABS: { type: TxType; label: string; full?: boolean }[] = [
  { type: "expense", label: "Pengeluaran" },
  { type: "income", label: "Pemasukan" },
  { type: "transfer", label: "Transfer antar akun" },
  { type: "owner_withdrawal", label: "Modal pemilik", full: true },
];

const TERMS = [
  { value: "", label: "Lunas sekali" },
  { value: "dp", label: "DP" },
  { value: "installment", label: "Cicilan" },
  { value: "settlement", label: "Pelunasan" },
];

const fmt = (v: string) => amountDisplay(amountDigits(v));

/**
 * Modal "Catat transaksi" (Figma 12c / 12h / 12h-2 / 12i, validasi 12j). Dipakai untuk catat baru,
 * edit, dan duplikat transaksi manual. Setelah simpan → toast dengan "Batalkan" 5 detik (12k).
 */
export function TxModal({ open, onClose, options, initial, duplicate = false, presetSessionId, presetTripId }: { open: boolean; onClose: () => void; options: TxFormOptions; initial?: FinTx | null; duplicate?: boolean; presetSessionId?: string; presetTripId?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!initial && !duplicate;
  const initialType: TxType = initial?.type ?? "expense";
  const [type, setType] = useState<TxType>(initialType);
  const [amount, setAmount] = useState(initial ? initial.amount.toLocaleString("id-ID") : "");
  const [fee, setFee] = useState("");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [fields, setFields] = useState<TxFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [removeProof, setRemoveProof] = useState(false);


  const isOwner = type === "owner_withdrawal" || type === "owner_contribution";
  const kind = type === "income" ? "income" : "expense";
  // Kategori arsip hanya tampil untuk transaksi yang sudah memakainya.
  const cats = options.categories.filter((c) => c.kind === kind && (!c.archived || c.id === initial?.categoryId));
  const ticket = options.categories.find((c) => c.id === categoryId)?.systemKey === "ticket";
  const tabs = TABS.filter((t) => !t.full || options.role === "full");
  const activeTab = isOwner ? "owner_withdrawal" : type;

  const submit = (formData: FormData) => {
    formData.set("type", type);
    formData.set("amount", amount.replace(/\D/g, ""));
    formData.set("fee", fee.replace(/\D/g, ""));
    if (editing) formData.set("id", initial!.id);
    if (removeProof) formData.set("removeProof", "1");
    start(async () => {
      const result = await saveTransaction(formData);
      if (!result.ok) {
        setFields(result.fields ?? {});
        setBanner(result.error);
        const first = Object.keys(result.fields ?? {})[0];
        if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
        return;
      }
      setFields({});
      setBanner(null);
      onClose();
      router.refresh();
      if (editing) toast.success(result.message);
      else
        toast.withAction(result.message, {
          label: "Batalkan",
          onClick: async () => {
            toast.result(await deleteTransaction(result.id, "dibatalkan dari toast"));
            router.refresh();
          },
        });
    });
  };

  const err = (k: keyof TxFieldErrors) => fields[k] && <span className={styles.errorText}>{fields[k]}</span>;
  const field = (label: ReactNode, name: keyof TxFieldErrors | string, control: ReactNode, hint?: ReactNode) => (
    <label className={styles.field}>
      <span>{label}</span>
      {control}
      {err(name as keyof TxFieldErrors)}
      {hint && <small>{hint}</small>}
    </label>
  );
  const opt = (label: string) => (
    <>
      {label} <span className={styles.optional}>(opsional)</span>
    </>
  );
  const accountSelect = (name: string, value: string | null | undefined, exclude?: string) => (
    <select name={name} defaultValue={value ?? options.defaultAccountId ?? ""} className={cx(styles.input, fields[name as keyof TxFieldErrors] && styles.inputError)}>
      <option value="">Pilih akun</option>
      {options.accounts
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  );

  return (
    <FinanceModal open={open} onClose={onClose} title={editing ? `Ubah ${initial!.code}` : "Catat transaksi"} subtitle={<>Pemasukan tiket & order shop sudah tercatat otomatis.</>} action={submit} formRef={formRef}
      footer={
        <>
        <span className={styles.footNote}>Tercatat atas nama {options.userName}</span>
        <div className={styles.actions}>
          <AdminButton variant="outline" onClick={onClose}>
            Batal
          </AdminButton>
          <AdminButton variant="primary" icon="check-bold" type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan transaksi"}
          </AdminButton>
        </div>
        </>
      }
    >
      {!editing && (
        <div className={styles.segment} role="tablist" aria-label="Jenis transaksi">
          {tabs.map((t) => (
            <button
              key={t.type}
              type="button"
              role="tab"
              aria-selected={activeTab === t.type}
              className={cx(styles.segBtn, activeTab === t.type && styles.tabActive)}
              onClick={() => {
                setType(t.type);
                setCategoryId("");
                setFields({});
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {banner && (
        <p className={styles.errorBanner} role="alert">
          {banner}
        </p>
      )}

      {isOwner && (
        <div className={styles.segment} aria-label="Jenis modal pemilik">
          {(
            [
              ["owner_withdrawal", "Penarikan pemilik"],
              ["owner_contribution", "Setor modal"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" disabled={editing} className={cx(styles.segBtn, type === v && styles.segActive)} onClick={() => setType(v)}>
              {l}
            </button>
          ))}
        </div>
      )}

      <div className={styles.fieldRow}>
        {field("Tanggal", "date", <PickerInput type="date" name="date" max={options.today} defaultValue={initial && !duplicate ? initial.date : options.today} className={cx(styles.input, fields.date && styles.inputError)} required />)}
        {field(
          type === "transfer" ? "Jumlah ditarik" : "Jumlah",
          "amount",
          <span className={styles.money}>
            <span>Rp</span>
            <input name="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(fmt(e.target.value))} placeholder="0" className={cx(styles.input, fields.amount && styles.inputError)} aria-invalid={!!fields.amount} />
          </span>,
        )}
      </div>

      {(type === "income" || type === "expense") && (
        <div className={styles.fieldRow}>
          {field(
            "Kategori",
            "categoryId",
            <select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cx(styles.input, fields.categoryId && styles.inputError)}>
              <option value="">Pilih kategori</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>,
          )}
          {field(type === "expense" ? "Dibayar dari" : "Masuk ke", "accountId", accountSelect("accountId", initial?.accountId))}
        </div>
      )}

      {type === "transfer" && (
        <>
          <div className={styles.fieldRow}>
            {field("Dari akun", "accountId", accountSelect("accountId", initial?.accountId))}
            {field("Ke akun", "toAccountId", accountSelect("toAccountId", initial?.toAccountId ?? ""))}
          </div>
          {field(
            opt("Biaya transfer"),
            "fee",
            <span className={styles.money}>
              <span>Rp</span>
              <input name="fee" inputMode="numeric" value={fee} onChange={(e) => setFee(fmt(e.target.value))} placeholder="0" className={cx(styles.input, fields.fee && styles.inputError)} />
            </span>,
            "Withdraw Kuyy: selisih jumlah ditarik vs yang masuk bank → Biaya platform Kuyy. Pencairan PG → Biaya payment gateway.",
          )}
        </>
      )}

      {isOwner && (
        <div className={styles.fieldRow}>
          {field(type === "owner_withdrawal" ? "Diambil dari" : "Disetor ke", "accountId", accountSelect("accountId", initial?.accountId))}
          {field(opt("Pemilik"), "ownerName", <input name="ownerName" defaultValue={initial?.ownerName ?? ""} className={styles.input} />)}
        </div>
      )}

      {(type === "income" || type === "expense") && field(opt(type === "expense" ? "Vendor / penerima" : "Pembayar"), "counterparty", <input name="counterparty" defaultValue={initial?.counterparty ?? ""} className={styles.input} />)}

      {presetTripId && !initial && <input type="hidden" name="tripId" value={presetTripId} />}
      {(type === "income" || type === "expense") &&
        field(
          <>
            Kaitkan ke sesi / event <span className={styles.optional}>{ticket ? "(disarankan)" : "(opsional)"}</span>
          </>,
          "sessionId",
          <select name="sessionId" defaultValue={initial?.sessionId ?? presetSessionId ?? ""} className={styles.input}>
            <option value="">— Tidak dikaitkan —</option>
            {options.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>,
          type === "expense" ? "Biaya ikut dihitung di laba per sesi." : "Pendapatan ikut dihitung di laba per event.",
        )}

      {type === "income" &&
        ticket &&
        field(
          "Termin",
          "term",
          <select name="term" defaultValue={initial?.term ?? ""} className={styles.input}>
            {TERMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>,
          "Untuk DP / cicilan event (mis. Rally in Paradise). Tulis nama peserta di catatan.",
        )}

      {field(opt("Keterangan"), "description", <input name="description" defaultValue={initial && !duplicate ? initial.description : (initial?.description ?? "")} placeholder="Otomatis dari kategori & vendor bila kosong" className={styles.input} />)}
      {field(opt("Catatan"), "note", <input name="note" defaultValue={initial?.note ?? ""} className={styles.input} />)}

      {type !== "transfer" && (
        <label className={styles.field}>
          <span>
            Bukti (nota / struk / transfer) <span className={styles.optional}>(opsional)</span>
          </span>
          <span className={styles.upload}>
            <AdminIcon name="paperclip" size={18} />
            {editing && initial?.hasProof && !removeProof ? (
              <>
                <a href={`/admin/keuangan/bukti/${initial.id}`} target="_blank" rel="noreferrer" className={styles.link}>
                  {initial.proofName ?? "Lihat bukti"}
                </a>
                <button type="button" className={styles.link} onClick={() => setRemoveProof(true)}>
                  Hapus
                </button>
              </>
            ) : (
              <input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" />
            )}
          </span>
          {err("proof")}
          <small>JPG, PNG atau PDF · maks. 5 MB. Tanpa bukti tetap tersimpan (ditandai &quot;Belum&quot;).</small>
        </label>
      )}
    </FinanceModal>
  );
}

/** Tombol "Catat transaksi" + modalnya (header halaman Keuangan). */
/** `presetTripId`: transaksi baru langsung terkait trip itu (detail trip Keuangan). */
export function RecordTxButton({ options, label = "Catat transaksi", variant = "primary", presetSessionId, presetTripId }: { options: TxFormOptions; label?: string; variant?: "primary" | "outline"; presetSessionId?: string; presetTripId?: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <AdminButton
        variant={variant}
        icon="plus-bold"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {label}
      </AdminButton>
      <TxModal key={key} open={open} onClose={() => setOpen(false)} options={options} presetSessionId={presetSessionId} presetTripId={presetTripId} />
    </>
  );
}
