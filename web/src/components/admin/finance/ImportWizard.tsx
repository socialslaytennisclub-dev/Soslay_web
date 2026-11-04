"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton, PickerInput } from "@/components/admin/ui/AdminUI";
import { toast } from "@/components/admin/ui/Toaster";
import { cx } from "@/lib/cx";
import { dateLabel, monthLabel, rp, rpSigned, TX_TYPE_LABEL } from "@/lib/finance/format";
import { applyToSimilar, detectLayout, enrich, parseRows, similarityKey, type ColumnKey, type ColumnMap, type ImportError, type ImportFormat, type ImportTx } from "@/lib/finance/journal";
import type { FinCategory } from "@/lib/finance/types";
import { commitImport, readImportFile, saveCategory } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";
import { FinanceModal } from "./FinanceModal";

type Props = {
  categories: FinCategory[];
  autoTicketMonths: string[];
  existingKeys: string[];
  goLiveDate: string;
  ticketCategoryId: string | null;
  today: string;
  canSave: boolean;
};

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Unggah file", "Cocokkan kolom", "Kategori per transaksi", "Tinjau & import"];
const COLUMN_LABEL: Record<ColumnKey, string> = { date: "Tanggal", ref: "Ref", description: "Keterangan", account: "Akun", debit: "Debet", credit: "Kredit", amount: "Jumlah (+/−)" };
const DRAFT_KEY = "soslay-finance-import-draft";
const noopSubscribe = () => () => {};
const readDraftFlag = () => {
  try {
    return !!localStorage.getItem(DRAFT_KEY);
  } catch {
    return false;
  }
};
const nowMs = () => Date.now();
/** Draf import kedaluwarsa setelah 7 hari (K-10). */
const draftExpired = (savedAt: number) => nowMs() - savedAt > 7 * 86_400_000;

const lastDayOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const prevMonth = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
/** Tebak bulan data dari nama file, mis. "AUG 26 - SHEET ACCOUNTING" → 2026-08. */
function periodFromName(name: string): string | null {
  const m = /\b(jan|feb|mar|apr|may|mei|jun|jul|aug|agu|agt|sep|oct|okt|nov|dec|des)[a-z]*[\s_-]*'?(\d{2}|\d{4})\b/i.exec(name);
  if (!m) return null;
  const months = ["jan", "feb", "mar", "apr", "mei|may", "jun", "jul", "agu|aug|agt", "sep", "okt|oct", "nov", "des|dec"];
  const idx = months.findIndex((p) => new RegExp(`^(${p})`, "i").test(m[1]));
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return idx >= 0 ? `${year}-${String(idx + 1).padStart(2, "0")}` : null;
}

/** Admin / 13a–13j — Import jurnal Excel / CSV untuk data lama (sebelum go-live). */
export function ImportWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [format, setFormat] = useState<ImportFormat>("journal");
  const [columns, setColumns] = useState<ColumnMap>({});
  const [headerRow, setHeaderRow] = useState(0);
  const [period, setPeriod] = useState(prevMonth(props.goLiveDate));
  const [defaultDate, setDefaultDate] = useState(lastDayOf(prevMonth(props.goLiveDate)));
  const [txs, setTxs] = useState<ImportTx[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [dataRows, setDataRows] = useState(0);
  const [categories, setCategories] = useState(props.categories);
  const [newCats, setNewCats] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Draf import disimpan di browser (K-10) — bisa ditutup & dilanjutkan nanti.
  const storedDraft = useSyncExternalStore(noopSubscribe, readDraftFlag, () => false);
  const [draftCleared, setDraftCleared] = useState(false);
  const hasDraft = storedDraft && !draftCleared;
  useEffect(() => {
    if (!txs.length) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ fileName, rows, format, columns, headerRow, period, defaultDate, txs, errors, dataRows, step, savedAt: nowMs() }));
    } catch {
      /* penuh / diblokir — draf tidak wajib */
    }
  }, [txs, step, fileName, rows, format, columns, headerRow, period, defaultDate, errors, dataRows]);

  const resumeDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (!d || draftExpired(d.savedAt)) return clearDraft();
      setFileName(d.fileName);
      setRows(d.rows);
      setFormat(d.format);
      setColumns(d.columns);
      setHeaderRow(d.headerRow);
      setPeriod(d.period);
      setDefaultDate(d.defaultDate);
      setTxs(d.txs);
      setErrors(d.errors);
      setDataRows(d.dataRows);
      setStep(d.step);
    } catch {
      clearDraft();
    }
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* abaikan */
    }
    setDraftCleared(true);
  };

  const autoTicketMonths = useMemo(() => new Set(props.autoTicketMonths), [props.autoTicketMonths]);
  const existingKeys = useMemo(() => new Set(props.existingKeys), [props.existingKeys]);

  const parse = (over?: Partial<{ format: ImportFormat; columns: ColumnMap; headerRow: number; period: string; defaultDate: string; rows: string[][] }>) => {
    const opt = { format, columns, headerRow, period, defaultDate, ...over };
    const result = parseRows(over?.rows ?? rows, opt);
    const enriched = enrich(result.txs, {
      categories,
      autoTicketMonths,
      existingKeys,
      goLiveDate: props.goLiveDate,
      ticketCategoryId: props.ticketCategoryId,
    });
    setTxs(enriched);
    setErrors(result.errors);
    setDataRows(result.dataRows);
  };

  const upload = (form: FormData) =>
    start(async () => {
      setUploadError(null);
      const r = await readImportFile(form);
      if (!r.ok) return setUploadError(r.error);
      const layout = detectLayout(r.rows);
      const p = periodFromName(r.fileName) ?? period;
      setFileName(r.fileName);
      setRows(r.rows);
      setPeriod(p);
      setDefaultDate(lastDayOf(p));
      if (layout) {
        setFormat(layout.format);
        setColumns(layout.columns);
        setHeaderRow(layout.headerRow);
        parse({ rows: r.rows, format: layout.format, columns: layout.columns, headerRow: layout.headerRow, period: p, defaultDate: lastDayOf(p) });
      } else {
        setColumns({});
        setTxs([]);
        setErrors([{ rowFrom: 1, rowTo: 1, message: "Kolom Keterangan + Debet/Kredit (atau Jumlah) tidak ditemukan — pilih kolom secara manual." }]);
      }
      setStep(2);
    });

  const headers = rows[headerRow] ?? [];
  const counts = useMemo(() => {
    const active = txs.filter((t) => !t.skip);
    return {
      total: active.length,
      income: active.filter((t) => t.type === "income"),
      expense: active.filter((t) => t.type === "expense"),
      review: active.filter((t) => needsAttention(t)),
      manual: active.filter((t) => t.status === "manual"),
      suggested: active.filter((t) => t.status === "suggested"),
    };
  }, [txs]);

  return (
    <div className={styles.stack}>
      <div className={styles.wizard}>
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <span key={label} style={{ display: "contents" }}>
              {i > 0 && <span className={styles.wizLine} aria-hidden style={{ opacity: n <= step ? 1 : 0.2 }} />}
              <span className={cx(styles.wizStep, n <= step && styles.wizStepOn)}>
                <span className={cx(styles.wizDot, n < step && styles.wizDone, n === step && styles.wizCurrent)}>{n < step ? "✓" : n}</span>
                {label}
              </span>
            </span>
          );
        })}
      </div>

      {step === 1 && (
        <section className={styles.panel}>
          <form action={upload} className={styles.stack}>
            <label className={styles.dropzone}>
              <AdminIcon name="upload-simple" size={28} />
              <strong>Pilih file jurnal (.xlsx atau .csv)</strong>
              <span>Maks. 5 MB · sheet pertama · satu file per bulan</span>
              <input type="file" name="file" accept=".xlsx,.csv" required />
            </label>
            {uploadError && <p className={styles.errorBanner}>{uploadError}</p>}
            <p className={styles.note}>
              <AdminIcon name="question" size={16} />
              Untuk data <strong>sebelum go-live {dateLabel(props.goLiveDate)}</strong> (Sep 2025 – Nov 2026). Sejak go-live, pendapatan tiket tercatat dari Activities — baris bertanggal ≥ go-live akan ditolak supaya tidak dobel. Urutan disarankan: isi saldo awal per 1 Sep 2025 → import Sep 2025 → … → Nov 2026.
            </p>
            <div className={styles.actions}>
              <AdminButton type="submit" variant="primary" disabled={pending}>
                {pending ? "Membaca file…" : "Unggah & baca"}
              </AdminButton>
              {hasDraft && (
                <>
                  <AdminButton type="button" onClick={resumeDraft}>
                    Lanjutkan draf terakhir
                  </AdminButton>
                  <button type="button" className={styles.link} onClick={clearDraft}>
                    Hapus draf
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      )}

      {step === 2 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Cocokkan kolom & akun</h3>
              <p className={styles.panelSub}>
                {fileName} · {rows.length} baris
              </p>
            </div>
          </div>
          <div className={styles.stack}>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Format</span>
                <select
                  className={styles.input}
                  value={format}
                  onChange={(e) => {
                    const f = e.target.value as ImportFormat;
                    setFormat(f);
                    parse({ format: f });
                  }}
                >
                  <option value="journal">Jurnal umum (Debet / Kredit, 2 baris per transaksi)</option>
                  <option value="simple">Daftar sederhana (Jumlah +/−, 1 baris per transaksi)</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Baris judul kolom</span>
                <select
                  className={styles.input}
                  value={headerRow}
                  onChange={(e) => {
                    setHeaderRow(Number(e.target.value));
                    parse({ headerRow: Number(e.target.value) });
                  }}
                >
                  {rows.slice(0, 15).map((r, i) => (
                    <option key={i} value={i}>
                      Baris {i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.fieldRow}>
              {(format === "journal" ? (["date", "ref", "description", "account", "debit", "credit"] as ColumnKey[]) : (["date", "description", "amount", "account"] as ColumnKey[])).map((k) => (
                <label key={k} className={styles.field}>
                  <span>{COLUMN_LABEL[k]}</span>
                  <select
                    className={styles.input}
                    value={columns[k] ?? ""}
                    onChange={(e) => {
                      const next = { ...columns, [k]: e.target.value === "" ? undefined : Number(e.target.value) };
                      setColumns(next);
                      parse({ columns: next });
                    }}
                  >
                    <option value="">— tidak ada —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Kolom ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Bulan data</span>
                <input
                  type="month"
                  className={styles.input}
                  value={period}
                  max={prevMonth(props.goLiveDate)}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setDefaultDate(lastDayOf(e.target.value));
                    parse({ period: e.target.value, defaultDate: lastDayOf(e.target.value) });
                  }}
                />
                <small>Tanggal di keterangan (mis. &quot;Book TRT (22 Aug)&quot;) dipakai bila di bulan ini; tanggal bulan lain diabaikan.</small>
              </label>
              <label className={styles.field}>
                <span>Tanggal default</span>
                <PickerInput
                  type="date"
                  className={styles.input}
                  value={defaultDate}
                  onChange={(e) => {
                    setDefaultDate(e.target.value);
                    parse({ defaultDate: e.target.value });
                  }}
                />
                <small>Untuk baris tanpa tanggal lengkap (default akhir bulan).</small>
              </label>
            </div>
            <p className={styles.note}>
              <AdminIcon name="bank" size={16} />
              Akun kas di file dipetakan otomatis: &quot;Bank / BCA&quot; → Bank BCA, &quot;Kas&quot; → Kas tunai, &quot;Payment gateway&quot; → Payment gateway, &quot;Kuyy&quot; → Saldo Kuyy. Akun lain (Pendapatan Usaha, Biaya Produksi, Gaji) hanya petunjuk kategori.
            </p>
            <div className={cx(styles.note, errors.length ? styles.chipWarn : styles.chipOk)}>
              <AdminIcon name={errors.length ? "warning-circle" : "check-circle"} size={16} />
              <span>
                {dataRows} baris data → <strong>{txs.length} transaksi</strong>
                {errors.length ? `, ${errors.length} bagian bermasalah` : ", tanpa error"}. {txs.filter((t) => t.dateSource === "description").length} tanggal dari keterangan, {txs.filter((t) => t.dateSource === "default").length} tanggal default.
              </span>
            </div>
            {errors.length > 0 && (
              <div className={styles.boxList}>
                {errors.slice(0, 30).map((e, i) => (
                  <div key={i} className={styles.settingRow}>
                    <div>
                      Baris {e.rowFrom}
                      {e.rowTo !== e.rowFrom ? `–${e.rowTo}` : ""}
                      <small>{e.message}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              <AdminButton onClick={() => setStep(1)}>Unggah ulang</AdminButton>
              <AdminButton variant="primary" disabled={!txs.length} onClick={() => setStep(3)}>
                {errors.length ? "Lewati baris bermasalah & lanjut" : "Lanjut: kategori"}
              </AdminButton>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <CategoryWalker
          txs={txs}
          categories={categories}
          canSave={props.canSave}
          onChange={setTxs}
          onNewCategory={(c) => {
            setCategories((list) => [...list, c]);
            setNewCats((n) => [...n, c.id]);
          }}
          onDone={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <Review
          fileName={fileName}
          period={period}
          dataRows={dataRows}
          txs={txs}
          counts={counts}
          categories={categories}
          newCats={newCats}
          canSave={props.canSave}
          onChange={setTxs}
          onBack={() => setStep(3)}
          onCommit={(chosen, learn) =>
            start(async () => {
              const r = await commitImport({
                fileName,
                period,
                defaultDate,
                rowsTotal: dataRows,
                txs: chosen.map((t) => ({ type: t.type, date: t.date, amount: t.amount, description: t.description, account: t.account, toAccount: t.toAccount, categoryId: t.categoryId })),
                learn,
              });
              toast.result(r);
              if (r.ok) {
                clearDraft();
                router.push(`/admin/keuangan/transaksi?batch=${r.batchId}`);
              }
            })
          }
          pending={pending}
        />
      )}
    </div>
  );
}

const needsAttention = (t: ImportTx) => !t.skip && (t.flags.duplicateOf !== undefined || t.flags.existing || t.flags.goLive || t.flags.doubleIncome || (t.type !== "transfer" && !t.categoryId));

function statusOf(t: ImportTx): { label: string; tone: "lime" | "indigo" | "pink" | "neutral" } {
  if (t.skip) return { label: "Dilewati", tone: "neutral" };
  if (t.flags.goLive) return { label: "Sejak go-live — ditolak", tone: "pink" };
  if (t.flags.duplicateOf !== undefined || t.flags.existing) return { label: "Kemungkinan duplikat", tone: "pink" };
  if (t.flags.doubleIncome) return { label: "Risiko pendapatan ganda", tone: "pink" };
  if (t.type === "transfer") return { label: "Transfer", tone: "lime" };
  if (!t.categoryId) return { label: "Perlu dicek", tone: "pink" };
  if (t.status === "manual") return { label: "Dipilih manual", tone: "indigo" };
  return { label: "Saran otomatis", tone: "lime" };
}

function StatusPill({ t }: { t: ImportTx }) {
  const s = statusOf(t);
  return <span className={cx(styles.pill, s.tone === "lime" && styles.pillLime, s.tone === "indigo" && styles.pillAuto, s.tone === "pink" && styles.pillPink)}>{s.label}</span>;
}

/** 13d–13f — popup kategori per transaksi: saran terpilih, Enter = simpan & lanjut, terapkan ke yang mirip, lewati, kategori baru. */
function CategoryWalker({ txs, categories, canSave, onChange, onNewCategory, onDone, onBack }: { txs: ImportTx[]; categories: FinCategory[]; canSave: boolean; onChange: (t: ImportTx[]) => void; onNewCategory: (c: FinCategory) => void; onDone: () => void; onBack: () => void }) {
  // Transaksi yang perlu dilewati satu per satu: belum dipilih manual & bukan transfer.
  const queue = txs.filter((t) => t.type !== "transfer" && t.status !== "manual" && !t.skip);
  const [pos, setPos] = useState(0);
  const tx = queue[Math.min(pos, queue.length - 1)];
  // Pilihan per transaksi; berganti transaksi → kembali ke saran transaksi itu.
  const [picked, setPicked] = useState<{ index: number; id: string } | null>(null);
  const choice = picked && picked.index === tx?.index ? picked.id : (tx?.categoryId ?? "");
  const setChoice = (id: string) => tx && setPicked({ index: tx.index, id });
  const [similar, setSimilar] = useState(true);
  const [creating, setCreating] = useState<{ name: string; group: "revenue" | "cogs" | "opex" } | null>(null);
  const [pending, start] = useTransition();

  if (!tx) {
    return (
      <section className={styles.panel}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <AdminIcon name="check-circle" size={26} />
          </span>
          <p className={styles.emptyTitle}>Semua transaksi sudah berkategori</p>
          <AdminButton variant="primary" onClick={onDone}>
            Lanjut: tinjau
          </AdminButton>
        </div>
      </section>
    );
  }

  const kind = tx.type === "income" ? "income" : "expense";
  const options = categories.filter((c) => c.kind === kind && !c.isArchived && !c.isSystem);
  const remaining = queue.length;
  const save = () => {
    if (!choice) return;
    let next = txs.map((t) => (t.index === tx.index ? { ...t, categoryId: choice, status: "manual" as const } : t));
    if (similar) next = applyToSimilar(next, tx, choice);
    onChange(next);
    if (remaining <= 1) onDone();
  };
  const skip = () => {
    onChange(txs.map((t) => (t.index === tx.index ? { ...t, skip: true } : t)));
    if (remaining <= 1) onDone();
  };

  return (
    <section className={styles.walker} onKeyDown={(e) => e.key === "Enter" && !creating && (e.preventDefault(), save())}>
      <div className={styles.panelHead} style={{ marginBottom: 0 }}>
        <div>
          <h3 className={styles.panelTitle}>Kategori per transaksi</h3>
          <p className={styles.panelSub}>
            Transaksi {txs.length - remaining + 1} dari {txs.length} · sisa {remaining} untuk dicek
          </p>
        </div>
        <StatusPill t={tx} />
      </div>
      <div className={styles.progress}>
        <span style={{ width: `${((txs.length - remaining) / txs.length) * 100}%` }} />
      </div>
      <div className={styles.walkerTx}>
        <span className={styles.muted}>
          Baris {tx.rowFrom}
          {tx.rowTo !== tx.rowFrom ? `–${tx.rowTo}` : ""} · {TX_TYPE_LABEL[tx.type]} · {dateLabel(tx.date)}
          {tx.dateSource !== "column" ? ` (${tx.dateSource === "description" ? "dari keterangan" : "tanggal default"})` : ""}
        </span>
        <strong>{tx.description}</strong>
        <span className={cx(styles.strong, tx.type === "expense" && styles.neg)}>{rpSigned(tx.type === "expense" ? -tx.amount : tx.amount)}</span>
        {tx.hint && <p className={styles.muted}>Akun di file: {tx.hint}</p>}
      </div>
      {tx.flags.doubleIncome && (
        <p className={styles.alert}>
          <AdminIcon name="warning-circle" size={16} />
          Bulan ini sudah punya pendapatan tiket otomatis — pastikan withdraw Kuyy ini bukan pendapatan ganda. Pilih Tiket activity hanya bila belum tercatat.
        </p>
      )}
      {tx.flags.payout && <p className={styles.note}>Keterangan &quot;pencairan / payout&quot; biasanya pencairan payment gateway → sebaiknya dicatat sebagai Transfer (lewati baris ini & catat di form Transfer), atau pilih kategori bila memang pendapatan.</p>}
      <div className={styles.catGrid} role="radiogroup" aria-label="Kategori">
        {options.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={choice === c.id} className={cx(styles.catOption, choice === c.id && styles.catOptionOn)} onClick={() => setChoice(c.id)}>
            {c.name}
            {c.id === tx.suggestedCategoryId && <span className={styles.inlineHint}>saran</span>}
          </button>
        ))}
        {canSave && (
          <button type="button" className={styles.catOption} onClick={() => setCreating({ name: "", group: kind === "income" ? "revenue" : "opex" })}>
            + Kategori baru
          </button>
        )}
      </div>
      {creating && (
        <div className={styles.inlineForm}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>Nama kategori baru</span>
              <input className={styles.input} autoFocus value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Pos laporan</span>
              <select className={styles.input} value={creating.group} disabled={kind === "income"} onChange={(e) => setCreating({ ...creating, group: e.target.value as "cogs" | "opex" })}>
                {kind === "income" ? (
                  <option value="revenue">Pendapatan</option>
                ) : (
                  <>
                    <option value="opex">Beban operasional</option>
                    <option value="cogs">HPP</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <div className={styles.actions}>
            <AdminButton size="sm" onClick={() => setCreating(null)}>
              Batal
            </AdminButton>
            <AdminButton
              size="sm"
              variant="primary"
              disabled={!creating.name.trim() || pending}
              onClick={() =>
                start(async () => {
                  const r = await saveCategory({ name: creating.name, kind, reportGroup: creating.group, keywords: [similarityKey(tx.description)].filter(Boolean) });
                  if (!r.ok || !r.id) return toast.error(r.ok ? "Gagal membuat kategori." : r.error);
                  onNewCategory({ id: r.id, name: creating.name.trim(), kind, reportGroup: creating.group, journalAccount: "", systemKey: null, isSystem: false, isArchived: false, note: null, keywords: [] });
                  setChoice(r.id);
                  setCreating(null);
                  toast.success(r.message);
                })
              }
            >
              Buat kategori
            </AdminButton>
          </div>
        </div>
      )}
      <label className={styles.checkRow}>
        <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} />
        <span>
          Terapkan ke yang mirip
          <span className={styles.muted}> — transaksi lain dengan kata kunci &quot;{similarityKey(tx.description) || "—"}&quot; ikut diisi & dilewati</span>
        </span>
      </label>
      <div className={styles.modalFoot} style={{ padding: 0, border: 0 }}>
        <div className={styles.actions}>
          <AdminButton onClick={onBack}>Kembali</AdminButton>
          <button type="button" className={styles.link} onClick={skip}>
            Lewati — jangan import
          </button>
          <button type="button" className={styles.link} onClick={() => setPos((p) => (p + 1) % Math.max(queue.length, 1))}>
            Nanti saja
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={onDone}>
            Langsung ke tinjau
          </button>
          <AdminButton variant="primary" icon="check-bold" disabled={!choice} onClick={save}>
            Simpan & lanjut (Enter)
          </AdminButton>
        </div>
      </div>
    </section>
  );
}

type Counts = { total: number; income: ImportTx[]; expense: ImportTx[]; review: ImportTx[]; manual: ImportTx[]; suggested: ImportTx[] };

/** 13c tinjau + 13h konfirmasi (keputusan duplikat & dampak). */
function Review({
  fileName,
  period,
  dataRows,
  txs,
  counts,
  categories,
  newCats,
  canSave,
  onChange,
  onBack,
  onCommit,
  pending,
}: {
  fileName: string;
  period: string;
  dataRows: number;
  txs: ImportTx[];
  counts: Counts;
  categories: FinCategory[];
  newCats: string[];
  canSave: boolean;
  onChange: (t: ImportTx[]) => void;
  onBack: () => void;
  onCommit: (txs: ImportTx[], learn: { categoryId: string; keyword: string }[]) => void;
  pending: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "review" | "manual" | "suggested">("all");
  const [confirming, setConfirming] = useState(false);
  const [dupMode, setDupMode] = useState<"both" | "one">("one");

  const cat = new Map(categories.map((c) => [c.id, c]));
  const active = txs.filter((t) => !t.skip);
  const byCat = new Map<string, { name: string; amount: number; n: number; income: boolean; isNew: boolean }>();
  for (const t of active) {
    if (!t.categoryId) continue;
    const c = cat.get(t.categoryId);
    const e = byCat.get(t.categoryId) ?? { name: c?.name ?? "—", amount: 0, n: 0, income: t.type === "income", isNew: newCats.includes(t.categoryId) };
    e.amount += t.amount;
    e.n++;
    byCat.set(t.categoryId, e);
  }
  const list = filter === "review" ? counts.review : filter === "manual" ? counts.manual : filter === "suggested" ? counts.suggested : active;
  const dups = active.filter((t) => t.flags.duplicateOf !== undefined || t.flags.existing);
  const blocked = active.filter((t) => t.flags.goLive || (t.type !== "transfer" && !t.categoryId));
  const chosen = active.filter((t) => !t.flags.goLive && (t.type === "transfer" || t.categoryId) && !(dupMode === "one" && (t.flags.duplicateOf !== undefined || t.flags.existing)));
  const income = chosen.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = chosen.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const bankDelta = chosen.reduce((s, t) => s + (t.account === "bank_main" ? (t.type === "income" ? t.amount : -t.amount) : 0) + (t.toAccount === "bank_main" ? t.amount : 0), 0);
  const learn = chosen.filter((t) => t.status === "manual" && t.categoryId).map((t) => ({ categoryId: t.categoryId!, keyword: similarityKey(t.description) }));

  return (
    <>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Tinjau import jurnal</h2>
          <p className={styles.subtitle}>
            {fileName} · periode {monthLabel(period)}
          </p>
        </div>
        <div className={styles.actions}>
          <AdminButton onClick={onBack}>Kembali</AdminButton>
          <AdminButton variant="primary" disabled={!canSave || !chosen.length} onClick={() => setConfirming(true)}>
            Lanjut: konfirmasi
          </AdminButton>
        </div>
      </div>
      {!canSave && <p className={styles.alert}>Mode demo: import bisa dicoba sampai tinjau, tapi tidak disimpan.</p>}

      <div className={styles.statStrip}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Transaksi</span>
          <span className={styles.statValue}>{counts.total}</span>
          <span className={styles.statNote}>dari {dataRows} baris</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pemasukan</span>
          <span className={styles.statValue}>{rp(counts.income.reduce((s, t) => s + t.amount, 0))}</span>
          <span className={styles.statNote}>{counts.income.length} transaksi</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pengeluaran</span>
          <span className={cx(styles.statValue, styles.neg)}>{rp(counts.expense.reduce((s, t) => s + t.amount, 0))}</span>
          <span className={styles.statNote}>{counts.expense.length} transaksi</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Perlu perhatian</span>
          <span className={cx(styles.statValue, counts.review.length > 0 && styles.neg)}>{counts.review.length} transaksi</span>
          <span className={styles.statNote}>{counts.review.slice(0, 2).map((t) => statusOf(t).label).join(" · ") || "Semua siap"}</span>
        </div>
      </div>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle} style={{ marginBottom: 12 }}>
          Per kategori
        </h3>
        <div className={styles.chips}>
          {[...byCat.values()]
            .sort((a, b) => Number(b.income) - Number(a.income) || b.amount - a.amount)
            .map((c) => (
              <span key={c.name} className={cx(styles.catChip, c.income && styles.catChipIncome)}>
                {c.name} <b className={c.income ? undefined : styles.neg}>{rp(c.amount)}</b> <i>{c.n}×</i>
                {c.isNew && <span className={cx(styles.pill, styles.pillAuto)}>baru</span>}
              </span>
            ))}
        </div>
      </section>

      <section className={cx(styles.panel, styles.panelFlush)}>
        <div className={styles.listTop}>
          <div className={styles.segment}>
            {(
              [
                ["all", "Semua", active.length],
                ["review", "Perlu perhatian", counts.review.length],
                ["manual", "Dipilih manual", counts.manual.length],
                ["suggested", "Saran otomatis", counts.suggested.length],
              ] as const
            ).map(([k, l, n]) => (
              <button key={k} type="button" className={cx(styles.segBtn, filter === k && styles.segActive)} onClick={() => setFilter(k)}>
                {l} <span className={styles.count}>{n}</span>
              </button>
            ))}
          </div>
          <span className={styles.muted}>Klik kategori untuk mengubah</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Tanggal</th>
                <th>Keterangan</th>
                <th>Jenis</th>
                <th>Kategori</th>
                <th className={styles.num}>Jumlah</th>
                <th>Status</th>
                <th aria-label="Lewati" />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.index} className={cx(needsAttention(t) && styles.rowWarn)}>
                  <td className={styles.muted}>{t.index}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{dateLabel(t.date, false)}</td>
                  <td>
                    <span className={styles.cellTitle}>{t.description}</span>
                  </td>
                  <td>{TX_TYPE_LABEL[t.type]}</td>
                  <td>
                    {t.type === "transfer" ? (
                      <span className={styles.muted}>
                        {t.account} → {t.toAccount}
                      </span>
                    ) : (
                      <select
                        className={styles.inlineSelect}
                        value={t.categoryId ?? ""}
                        aria-label={`Kategori transaksi ${t.index}`}
                        onChange={(e) => onChange(txs.map((x) => (x.index === t.index ? { ...x, categoryId: e.target.value || null, status: "manual" } : x)))}
                      >
                        <option value="">Pilih kategori</option>
                        {categories
                          .filter((c) => c.kind === t.type && !c.isArchived && !c.isSystem)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className={cx(styles.num, styles.strong, t.type === "expense" && styles.neg)}>{t.type === "transfer" ? rp(t.amount) : rpSigned(t.type === "expense" ? -t.amount : t.amount)}</td>
                  <td>
                    <StatusPill t={t} />
                  </td>
                  <td>
                    <button type="button" className={styles.iconBtn} aria-label={`Lewati transaksi ${t.index}`} title="Lewati — jangan import" onClick={() => onChange(txs.map((x) => (x.index === t.index ? { ...x, skip: true } : x)))}>
                      <AdminIcon name="x" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFoot}>
          <span>
            Menampilkan {list.length} dari {active.length} transaksi{txs.length - active.length ? ` · ${txs.length - active.length} dilewati` : ""}
          </span>
        </div>
      </section>

      <FinanceModal open={confirming} onClose={() => setConfirming(false)} title="Konfirmasi import" subtitle={<>{fileName}</>}
        footer={
          <>
          <span />
          <div className={styles.actions}>
            <AdminButton onClick={() => setConfirming(false)}>Batal</AdminButton>
            <AdminButton variant="primary" disabled={pending || !chosen.length} onClick={() => onCommit(chosen, learn)}>
              {pending ? "Mengimpor…" : `Import ${chosen.length} transaksi`}
            </AdminButton>
          </div>
          </>
        }
      >
        {dups.length > 0 && (
          <div className={styles.inlineForm}>
            <strong>{dups.length} kemungkinan duplikat</strong>
            <p className={styles.muted}>Tanggal + keterangan + jumlah sama, di dalam file atau dengan transaksi yang sudah ada: {dups.slice(0, 3).map((d) => `#${d.index} ${d.description} · ${rp(d.amount)}`).join("; ")}</p>
            <div className={styles.segment}>
              <button type="button" className={cx(styles.segBtn, dupMode === "one" && styles.segActive)} onClick={() => setDupMode("one")}>
                Import satu saja
              </button>
              <button type="button" className={cx(styles.segBtn, dupMode === "both" && styles.segActive)} onClick={() => setDupMode("both")}>
                Import keduanya
              </button>
            </div>
          </div>
        )}
        {blocked.length > 0 && (
          <p className={styles.alert}>
            <AdminIcon name="warning-circle" size={16} />
            {blocked.length} transaksi tidak ikut diimpor (belum berkategori atau bertanggal sejak go-live).
          </p>
        )}
        <div className={styles.boxList}>
          <div className={styles.settingRow}>
            <div>Transaksi diimpor</div>
            <strong>{chosen.length}</strong>
          </div>
          <div className={styles.settingRow}>
            <div>Pendapatan {monthLabel(period)}</div>
            <strong>+{rp(income)}</strong>
          </div>
          <div className={styles.settingRow}>
            <div>Biaya {monthLabel(period)}</div>
            <strong className={styles.neg}>{rp(-expense)}</strong>
          </div>
          <div className={styles.settingRow}>
            <div>Dampak laba bulan itu</div>
            <strong>{rpSigned(income - expense)}</strong>
          </div>
          <div className={styles.settingRow}>
            <div>Perubahan saldo Bank BCA</div>
            <strong>{rpSigned(bankDelta)}</strong>
          </div>
          {newCats.length > 0 && (
            <div className={styles.settingRow}>
              <div>Kategori baru</div>
              <strong>{newCats.map((id) => cat.get(id)?.name).join(", ")}</strong>
            </div>
          )}
        </div>
        <p className={styles.muted}>Hasil import berlabel &quot;Import · {fileName}&quot; dan bisa dibatalkan sekaligus dalam 24 jam.</p>
      </FinanceModal>
    </>
  );
}

