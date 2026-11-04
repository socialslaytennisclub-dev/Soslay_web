import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/admin/finance/Finance.module.css";
import { SearchBox, UndoImportButton } from "@/components/admin/finance/FinanceActions";
import { FinanceTabs, PageHead, SegmentLinks, StatStrip } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import { dateTimeWib, monthLabel, pct, rp, rpSigned } from "@/lib/finance/format";
import { firstDay, lastDay, posted, profitLoss } from "@/lib/finance/reports";
import type { FinTx } from "@/lib/finance/types";
import { toTxViews, txFormOptions } from "@/lib/finance/views";
import { one } from "@/server/admin/query";
import { canUndoImport, financePage, monthParam } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Transaksi" };

const PAGE_SIZE = 20;
const AUTO = new Set(["ticket", "ticket_manual_paid", "kuyy_import", "shop_order_verified", "refund", "pg_payout"]);
type Tab = "all" | "income" | "expense" | "transfer";

/** Admin / 12b Transaksi · 12t filter tanpa hasil · 12x tampilan Pencatat keuangan · 13i hasil import. */
export default async function FinanceTransactionsPage({ searchParams }: PageProps<"/admin/keuangan/transaksi">) {
  const ctx = await financePage("record");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const raw = await searchParams;
  const { month, months } = monthParam(data, raw.m);
  const allMonths = one(raw.m) === "all";
  const tab = (["income", "expense", "transfer"].includes(one(raw.tab) ?? "") ? one(raw.tab) : "all") as Tab;
  const cat = one(raw.cat) ?? "";
  const acc = one(raw.acc) ?? "";
  const src = one(raw.src) ?? "";
  const q = (one(raw.q) ?? "").toLowerCase();
  const batchId = one(raw.batch);
  const page = Math.max(1, Number(one(raw.page)) || 1);
  const batch = batchId ? data.batches.find((b) => b.id === batchId) : undefined;

  const inScope = (t: FinTx) => (batchId ? t.importBatchId === batchId : allMonths || t.date.startsWith(month));
  const base = posted(data).filter(inScope);
  const matchFilters = (t: FinTx) =>
    (!cat || t.categoryId === cat) &&
    (!acc || t.accountId === acc || t.toAccountId === acc) &&
    (!src || (src === "auto" ? AUTO.has(t.source) : src === "import" ? t.source === "import" : !AUTO.has(t.source) && t.source !== "import")) &&
    (!q || [t.description, t.counterparty, t.note, t.code, t.ownerName].some((v) => v?.toLowerCase().includes(q)));
  const filtered = base.filter(matchFilters);
  const isType = (t: FinTx, k: Tab) => k === "all" || (k === "transfer" ? t.type === "transfer" : k === "income" ? t.type === "income" || t.type === "owner_contribution" : t.type === "expense" || t.type === "owner_withdrawal");
  const counts = { all: filtered.length, income: filtered.filter((t) => isType(t, "income")).length, expense: filtered.filter((t) => isType(t, "expense")).length, transfer: filtered.filter((t) => isType(t, "transfer")).length };
  const views = toTxViews(data, filtered.filter((t) => isType(t, tab)), role, userId);
  const pages = Math.max(1, Math.ceil(views.length / PAGE_SIZE));
  const shown = views.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);

  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { m: one(raw.m), tab: tab === "all" ? undefined : tab, cat, acc, src, q: one(raw.q), batch: batchId, page: undefined as string | number | undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && v !== "all") p.set(k, String(v));
    const s = p.toString();
    return `/admin/keuangan/transaksi${s ? `?${s}` : ""}`;
  };

  const options = txFormOptions(data, role, userName);
  const filtersOn = !!(cat || acc || src || q);
  // Ringkasan atas mengikuti periode yang dipilih (bulan, atau semua periode).
  const pnl = allMonths ? profitLoss(data, "0000-01-01", data.today) : profitLoss(data, firstDay(month), lastDay(month));
  const monthTx = allMonths ? posted(data) : posted(data).filter((t) => t.date.startsWith(month));
  const incomeCount = monthTx.filter((t) => t.type === "income").length;
  const expenseCount = monthTx.filter((t) => t.type === "expense").length;
  const noProof = monthTx.filter((t) => t.type === "expense" && t.source === "manual" && !t.parentId && !t.hasProof).length;
  const undoable = batch ? canUndoImport(batch) : false;

  return (
    <>
      <AdminTopbar breadcrumb={batch ? "Keuangan / Transaksi / Import jurnal" : "Keuangan / Transaksi"} title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          title={role === "full" ? "Transaksi" : "Catat & lihat transaksi"}
          subtitle={role === "full" ? "Semua pemasukan & pengeluaran klub. Tiket activity & order shop yang lunas tercatat otomatis." : "Kamu login sebagai Pencatat keuangan — bisa mencatat pemasukan, pengeluaran & transfer, dan mengubah transaksi yang kamu catat sendiri."}
          actions={
            <>
              {role === "full" && (
                <>
                  <AdminButton icon="upload-simple" href="/admin/keuangan/transaksi/import">
                    Import jurnal
                  </AdminButton>
                  <AdminButton icon="download-simple" href={`/admin/keuangan/export?reports=transactions&format=csv&m=${allMonths ? "all" : month}`} prefetch={false} download>
                    Export CSV
                  </AdminButton>
                </>
              )}
              <RecordTxButton options={options} />
            </>
          }
        />
        <FinanceTabs active="transaksi" role={role} query={`?m=${month}`} />

        {batch && (
          <div className={cx(styles.note, styles.chipOk)} style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              <AdminIcon name="check-circle" size={16} /> Import · <strong>{batch.fileName}</strong> — {batch.txTotal} transaksi, {dateTimeWib(batch.importedAt)}.
              {batch.status === "undone" ? " Import ini sudah dibatalkan." : undoable ? ` Bisa dibatalkan sampai ${dateTimeWib(batch.undoUntil)}.` : ""}
            </span>
            <span className={styles.actions}>
              {undoable && role === "full" && <UndoImportButton batchId={batch.id} fileName={batch.fileName} count={batch.txTotal} />}
              <Link className={styles.link} href="/admin/keuangan/transaksi">
                Semua transaksi ›
              </Link>
            </span>
          </div>
        )}

        {role === "full" && !batch && (
          <StatStrip
            items={[
              { label: "Pemasukan", value: rp(pnl.totalRevenue), note: `${incomeCount} transaksi` },
              { label: "Pengeluaran", value: rp(pnl.totalExpense), note: `${expenseCount} transaksi`, tone: "neg" },
              { label: "Selisih (laba bersih)", value: rpSigned(pnl.netProfit), note: `Margin ${pct(pnl.netMargin)}` },
              { label: "Belum ada bukti", value: `${noProof} transaksi`, note: "Nota / struk belum diunggah", tone: noProof ? "neg" : undefined },
            ]}
          />
        )}

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.listTop}>
            <SegmentLinks
              label="Jenis transaksi"
              active={tab}
              items={[
                { key: "all", label: "Semua", href: href({ tab: undefined }), count: counts.all },
                { key: "income", label: "Pemasukan", href: href({ tab: "income" }), count: counts.income },
                { key: "expense", label: "Pengeluaran", href: href({ tab: "expense" }), count: counts.expense },
                { key: "transfer", label: "Transfer", href: href({ tab: "transfer" }), count: counts.transfer },
              ]}
            />
            <SearchBox value={one(raw.q) ?? ""} placeholder="Cari keterangan, vendor, kode…" />
          </div>
          {!batch && (
            <div className={styles.listFilters}>
              <span className={styles.muted}>Filter</span>
              <ParamSelect name="m" value={allMonths ? "all" : month} options={[...months, { value: "all", label: "Semua periode" }]} label="Periode" reset={["page"]} />
              <ParamSelect name="cat" value={cat} options={[{ value: "", label: "Kategori: Semua" }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]} label="Kategori" reset={["page"]} />
              <ParamSelect name="acc" value={acc} options={[{ value: "", label: "Akun: Semua" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]} label="Akun" reset={["page"]} />
              <ParamSelect
                name="src"
                value={src}
                options={[
                  { value: "", label: "Sumber: Semua" },
                  { value: "auto", label: "Otomatis" },
                  { value: "manual", label: "Manual" },
                  { value: "import", label: "Import" },
                ]}
                label="Sumber"
                reset={["page"]}
              />
              {filtersOn && (
                <Link className={styles.link} href={href({ cat: "", acc: "", src: "", q: "" })}>
                  Reset filter
                </Link>
              )}
            </div>
          )}

          {shown.length ? (
            <TxTable rows={shown} options={options} openId={one(raw.trx)} />
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <AdminIcon name="magnifying-glass" size={24} />
              </span>
              <p className={styles.emptyTitle}>{filtersOn ? "Tidak ada transaksi yang cocok" : `Belum ada transaksi ${allMonths ? "" : `di ${monthLabel(month)}`}`}</p>
              <p>{filtersOn ? "Coba ubah periode, kategori atau kata kunci." : "Catat transaksi pertama atau import jurnal data lama."}</p>
              {filtersOn && (
                <AdminButton href={href({ cat: "", acc: "", src: "", q: "" })} variant="primary">
                  Reset filter
                </AdminButton>
              )}
            </div>
          )}

          {views.length > 0 && (
            <div className={styles.tableFoot}>
              <span>
                Menampilkan {(Math.min(page, pages) - 1) * PAGE_SIZE + 1}–{Math.min(Math.min(page, pages) * PAGE_SIZE, views.length)} dari {views.length} transaksi
              </span>
              {pages > 1 && (
                <nav className={styles.pager} aria-label="Halaman">
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
                    .map((p, i, list) => (
                      <span key={p} style={{ display: "contents" }}>
                        {i > 0 && p - list[i - 1] > 1 && <span className={styles.pageBtn}>…</span>}
                        <Link href={href({ page: p })} scroll={false} className={cx(styles.pageBtn, p === page && styles.pageActive)} aria-current={p === page ? "page" : undefined}>
                          {p}
                        </Link>
                      </span>
                    ))}
                </nav>
              )}
            </div>
          )}
        </section>

        <div className={styles.legend}>
          <span>
            <AdminIcon name="link-simple" size={14} /> Bukti otomatis dari sistem (tiket / order)
          </span>
          <span>
            <AdminIcon name="image" size={14} /> Nota / struk terlampir
          </span>
          <span>
            <span className={cx(styles.pill, styles.pillPink)}>Belum</span> Bukti belum diunggah
          </span>
        </div>
      </div>
    </>
  );
}
