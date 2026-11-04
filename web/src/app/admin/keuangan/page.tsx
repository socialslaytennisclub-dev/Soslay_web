import type { Metadata } from "next";
import { TrendChart } from "@/components/admin/finance/Charts";
import { ExportButton } from "@/components/admin/finance/ExportDialog";
import styles from "@/components/admin/finance/Finance.module.css";
import { FinanceTabs, PageHead } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon, type AdminIconName } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import { dateLabel, dateTimeWib, monthLabel, pct, rp, rpShort } from "@/lib/finance/format";
import { accountBalances, addMonths, asOfFor, firstDay, lastDay, pctChange, posted, profitLoss, trend } from "@/lib/finance/reports";
import { toTxViews, txFormOptions } from "@/lib/finance/views";
import { financePage, monthParam } from "@/server/admin/finance-page";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Ringkasan" };

const ACCOUNT_ICON: Record<string, AdminIconName> = { bank: "bank", payment_gateway: "money", cash: "wallet", platform: "tennis-ball" };
const SOURCE_COLORS = ["var(--color-indigo-600)", "var(--color-navy-900)", "var(--color-lime-500)", "var(--color-indigo-150, #c9cbff)", "var(--color-pink-400)"];

/** Admin / 12a Keuangan — Ringkasan (kosong: 12s). */
export default async function FinanceSummaryPage({ searchParams }: PageProps<"/admin/keuangan">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const raw = await searchParams;
  const { month, months } = monthParam(data, raw.m);
  const options = txFormOptions(data, role, userName);
  const asOf = asOfFor(data, month);
  const balances = accountBalances(data, asOf);
  const cashAccounts = data.accounts.filter((a) => a.isActive || (balances.get(a.id) ?? 0) !== 0);
  const cashTotal = cashAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const isEmpty = data.transactions.length === 0;

  const topbar = <AdminTopbar breadcrumb="Keuangan / Ringkasan" title="Keuangan" />;
  if (isEmpty) {
    const hasOpening = data.accounts.some((a) => a.openingBalance !== 0) || data.balanceItems.length > 0;
    const steps = [
      { done: hasOpening, title: "Atur akun & saldo awal", body: "Masukkan saldo Bank, payment gateway & kas per 1 Sep 2025.", action: <AdminButton size="sm" variant="primary" href="/admin/keuangan/neraca?saldo=1">Atur sekarang</AdminButton> },
      { done: false, title: "Import data lama", body: "Jurnal Excel Sep 2025 – Nov 2026, satu file per bulan.", action: <AdminButton size="sm" href="/admin/keuangan/transaksi/import">Import jurnal</AdminButton> },
      { done: false, title: "Periksa kategori", body: "Kategori umum sudah disiapkan — tambah sesuai kebutuhan.", action: <AdminButton size="sm" href="/admin/keuangan/pengaturan">Lihat kategori</AdminButton> },
      { done: false, title: "Catat transaksi pertama", body: "Mulai go-live 1 Des 2026 pendapatan tiket tercatat dari Activities.", action: <RecordTxButton options={options} label="Catat transaksi" variant="outline" /> },
    ];
    return (
      <>
        {topbar}
        <div className={pageStyles.content}>
          <PageHead title="Ringkasan keuangan" subtitle="Belum ada transaksi tercatat." />
          <FinanceTabs active="ringkasan" role={role} />
          <section className={styles.panel}>
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <AdminIcon name="wallet" size={26} />
              </span>
              <p className={styles.emptyTitle}>Mulai catat keuangan Soslay</p>
              <p>Tiga langkah supaya laba rugi & neraca langsung akurat.</p>
              <div className={styles.steps}>
                {steps.map((s, i) => (
                  <div key={s.title} className={styles.stepItem}>
                    <span className={cx(styles.stepNum, s.done && styles.stepDone)}>{s.done ? "✓" : i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <strong>{s.title}</strong>
                      <p className={styles.muted}>{s.body}</p>
                    </div>
                    {s.action}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }

  const pnl = profitLoss(data, firstDay(month), lastDay(month));
  const prevYm = addMonths(month, -1);
  const prev = profitLoss(data, firstDay(prevYm), lastDay(prevYm));
  const six = trend(data, month, 6);

  const expenses = [...pnl.cogs.map((l) => ({ ...l, name: l.name === "Produksi merchandise" ? "HPP merchandise" : l.name })), ...pnl.opex].sort((a, b) => b.amount - a.amount);
  const totalExpense = pnl.totalCogs + pnl.totalOpex;
  const top = expenses.slice(0, 5);
  const rest = expenses.slice(5);
  const expenseRows = rest.length ? [...top, { categoryId: "rest", name: `Lainnya (${rest.length} kategori)`, amount: rest.reduce((s, l) => s + l.amount, 0) }] : top;
  const maxExpense = Math.max(1, ...expenseRows.map((r) => r.amount));

  const monthTx = posted(data).filter((t) => t.date.startsWith(month));
  const missingProof = monthTx.filter((t) => t.type === "expense" && t.source === "manual" && !t.parentId && !t.hasProof).length;
  const recent = toTxViews(data, posted(data).slice(0, 40), role, userId).slice(0, 6);

  return (
    <>
      {topbar}
      <div className={pageStyles.content}>
        <PageHead
          title="Ringkasan keuangan"
          subtitle={`Periode ${monthLabel(month)} · diperbarui ${dateTimeWib(new Date().toISOString())}`}
          actions={
            <>
              <ParamSelect name="m" value={month} options={months} label="Periode" />
              <ExportButton month={month} />
              <RecordTxButton options={options} />
            </>
          }
        />
        <FinanceTabs active="ringkasan" role={role} query={`?m=${month}`} />

        <div className={styles.kpis}>
          <Kpi icon="trend-up" label="Pendapatan" value={rpShort(pnl.totalRevenue)} delta={round1(pctChange(pnl.totalRevenue, prev.totalRevenue))} note={`vs ${rpShort(prev.totalRevenue)} di ${monthLabel(prevYm).split(" ")[0]}`} />
          <Kpi icon="trend-down" label="Pengeluaran" value={rpShort(pnl.totalExpense)} delta={round1(pctChange(pnl.totalExpense, prev.totalExpense))} note="HPP & beban operasional" />
          <Kpi icon="money" label="Laba bersih" value={rpShort(pnl.netProfit)} delta={round1(pctChange(pnl.netProfit, prev.netProfit))} note={`Margin ${pct(pnl.netMargin)} (${monthLabel(prevYm).split(" ")[0]} ${pct(prev.netMargin)})`} />
          <Kpi icon="bank" label="Saldo kas & bank" value={rpShort(cashTotal)} note={`${cashAccounts.length} akun · per ${dateLabel(asOf)}`} />
        </div>

        <div className={styles.gridSide}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Pendapatan vs pengeluaran</h3>
                <p className={styles.panelSub}>6 bulan terakhir · laba bersih tercatat di bawah tiap bulan</p>
              </div>
              <div className={styles.legend}>
                <span>
                  <i className={styles.dot} style={{ background: "var(--color-indigo-600)" }} /> Pendapatan
                </span>
                <span>
                  <i className={styles.dot} style={{ background: "var(--color-indigo-150, #c9cbff)" }} /> Pengeluaran
                </span>
              </div>
            </div>
            <TrendChart months={six} current={month} />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Saldo per akun</h3>
                <p className={styles.panelSub}>Per {dateLabel(asOf)}</p>
              </div>
            </div>
            <div className={styles.accList}>
              {cashAccounts.map((a) => (
                <div key={a.id} className={styles.accItem}>
                  <span className={styles.accIcon}>
                    <AdminIcon name={ACCOUNT_ICON[a.type] ?? "wallet"} size={18} />
                  </span>
                  <span className={styles.accName}>
                    {a.name}
                    <small>{a.note}</small>
                  </span>
                  <span className={cx(styles.accAmount, (balances.get(a.id) ?? 0) < 0 && styles.neg)}>{rp(balances.get(a.id) ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className={styles.accTotal}>
              <span>Total kas & bank</span>
              <strong>{rp(cashTotal)}</strong>
            </div>
            <a className={styles.link} href="/admin/keuangan/pengaturan">
              Kelola akun & saldo awal ›
            </a>
          </section>
        </div>

        <div className={styles.gridHalf}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Pengeluaran per kategori</h3>
                <p className={styles.panelSub}>
                  {monthLabel(month)} · total {rp(totalExpense)}
                </p>
              </div>
              <a className={styles.link} href={`/admin/keuangan/laba-rugi?m=${month}`}>
                Laba rugi ›
              </a>
            </div>
            <div className={styles.bars}>
              {expenseRows.length === 0 && <p className={styles.muted}>Belum ada pengeluaran bulan ini.</p>}
              {expenseRows.map((r, i) => (
                <div key={r.categoryId} className={styles.barRow}>
                  <span>{r.name}</span>
                  <strong>{rp(r.amount)}</strong>
                  <small>{pct(totalExpense ? (r.amount / totalExpense) * 100 : 0)}</small>
                  <span className={styles.track}>
                    <span className={cx(styles.fill, i === 0 && styles.fillNavy)} style={{ display: "block", width: `${(r.amount / maxExpense) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Pendapatan per sumber</h3>
                <p className={styles.panelSub}>
                  {monthLabel(month)} · total {rp(pnl.totalRevenue)}
                </p>
              </div>
            </div>
            {pnl.totalRevenue > 0 && (
              <div className={styles.stacked}>
                {pnl.revenue.map((l, i) => (
                  <span key={l.categoryId} style={{ width: `${(l.amount / pnl.totalRevenue) * 100}%`, background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                ))}
              </div>
            )}
            <div className={styles.bars}>
              {pnl.revenue.map((l, i) => (
                <div key={l.categoryId} className={styles.barRow}>
                  <span>
                    <i className={styles.dot} style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length], marginRight: 8 }} />
                    {l.name} <span className={cx(styles.pill, l.auto && styles.pillAuto)}>{l.auto ? "Otomatis" : "Manual"}</span>
                  </span>
                  <strong>{rp(l.amount)}</strong>
                  <small>{pct((l.amount / pnl.totalRevenue) * 100)}</small>
                </div>
              ))}
              {pnl.revenue.length === 0 && <p className={styles.muted}>Belum ada pendapatan bulan ini.</p>}
            </div>
            <p className={styles.note} style={{ marginTop: 16 }}>
              <AdminIcon name="check-circle" size={16} />
              Otomatis = tercatat dari Activities (import peserta Kuyy, Tandai Lunas) & order shop yang diverifikasi. Pendapatan tiket diakui di tanggal uang diterima.
            </p>
          </section>
        </div>

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Transaksi terbaru</h3>
              <p className={styles.panelSub}>
                {monthTx.length} transaksi bulan ini{missingProof ? ` · ${missingProof} pengeluaran belum ada bukti` : ""}
              </p>
            </div>
            <a className={styles.link} href={`/admin/keuangan/transaksi?m=${month}`}>
              Semua transaksi ›
            </a>
          </div>
          <TxTable rows={recent} compact showProof={false} />
        </section>
      </div>
    </>
  );
}

const round1 = (v: number | null) => (v === null ? undefined : Math.round(v * 10) / 10);
