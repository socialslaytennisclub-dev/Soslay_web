import type { Metadata } from "next";
import { BalanceSetupButton } from "@/components/admin/finance/BalanceSetup";
import { ExportButton } from "@/components/admin/finance/ExportDialog";
import styles from "@/components/admin/finance/Finance.module.css";
import { FinanceTabs, PageHead } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { cx } from "@/lib/cx";
import { acct, dateLabel, monthLabel, rp, rpShort } from "@/lib/finance/format";
import { asOfFor, balanceSheet, type BsLine } from "@/lib/finance/reports";
import { one } from "@/server/admin/query";
import { financePage, monthParam } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Neraca" };

function Lines({ lines }: { lines: BsLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <div key={l.label} className={styles.bsRow}>
          <span>
            {l.label}
            {l.note && <span className={styles.bsRowNote}>{l.note}</span>}
          </span>
          <span className={cx(styles.pill, l.auto && styles.pillAuto)}>{l.auto ? "Otomatis" : "Manual"}</span>
          <span>{acct(l.amount)}</span>
        </div>
      ))}
    </>
  );
}

/** Admin / 12e — Neraca per tanggal (default akhir bulan berjalan) + 12n saldo awal & penyesuaian. */
export default async function BalanceSheetPage({ searchParams }: PageProps<"/admin/keuangan/neraca">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role } = ctx;
  const raw = await searchParams;
  const { month, months } = monthParam(data, raw.m);
  const asOf = asOfFor(data, month);
  const bs = balanceSheet(data, asOf);
  const balanced = bs.difference === 0;

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Neraca" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          title="Neraca"
          subtitle="Posisi harta, utang & modal klub pada satu tanggal."
          actions={
            <>
              <BalanceSetupButton accounts={data.accounts.map((a) => ({ id: a.id, name: a.name, openingBalance: a.openingBalance, openingDate: a.openingDate }))} items={data.balanceItems} autoOpen={one(raw.saldo) === "1"} />
              <ExportButton month={month} preset={["balance"]} label="Export" />
            </>
          }
        />
        <FinanceTabs active="neraca" role={role} query={`?m=${month}`} />
        <div className={styles.toolbar}>
          <ParamSelect name="m" value={month} options={months.map((m) => ({ value: m.value, label: `Per ${dateLabel(asOfFor(data, m.value))}` }))} label="Tanggal neraca" />
          <span className={cx(styles.chipNote, balanced ? styles.chipOk : styles.chipWarn)}>
            <AdminIcon name={balanced ? "check-circle" : "warning-circle"} size={14} />
            {balanced ? "Seimbang · Aset = Kewajiban + Ekuitas" : `Selisih ${rp(bs.difference)}`}
          </span>
        </div>
        {!balanced && (
          <p className={styles.alert}>
            <AdminIcon name="warning-circle" size={16} />
            Aset belum sama dengan kewajiban + ekuitas (selisih {rp(bs.difference)}). Biasanya karena saldo awal akun belum diimbangi modal / laba ditahan awal — periksa lewat Saldo awal & penyesuaian.
          </p>
        )}

        <div className={styles.kpis}>
          <Kpi icon="bank" label="Total aset" value={rpShort(bs.totalAssets)} note="Kas, bank, piutang & peralatan" />
          <Kpi icon="clock" label="Total kewajiban" value={rpShort(bs.totalLiabilities)} note="Utang vendor & kewajiban lain" />
          <Kpi icon="shield-check" label="Ekuitas (modal)" value={rpShort(bs.totalEquity)} note="Milik pemilik klub" />
          <Kpi icon="money" label="Ketahanan kas" value={bs.runwayMonths === null ? "—" : `±${bs.runwayMonths.toLocaleString("id-ID", { maximumFractionDigits: 1 })} bulan`} note={`Kas & bank ÷ total biaya ${monthLabel(month).split(" ")[0]}`} />
        </div>

        <div className={styles.gridHalf} style={{ alignItems: "stretch" }}>
          <section className={styles.bsCard}>
            <div className={styles.panelHead} style={{ padding: "24px 24px 0" }}>
              <div>
                <h3 className={styles.panelTitle}>Aset</h3>
                <p className={styles.panelSub}>Apa yang dimiliki klub</p>
              </div>
            </div>
            <p className={styles.bsGroup}>Aset lancar</p>
            <Lines lines={bs.currentAssets} />
            <div className={styles.bsTotal}>
              <span>Total aset lancar</span>
              <span>{acct(bs.totalCurrentAssets)}</span>
            </div>
            {bs.fixedAssets.length > 0 && (
              <>
                <p className={styles.bsGroup}>Aset tetap</p>
                <Lines lines={bs.fixedAssets} />
                <div className={styles.bsTotal}>
                  <span>Total aset tetap</span>
                  <span>{acct(bs.totalFixedAssets)}</span>
                </div>
              </>
            )}
            <div className={styles.bsGrand}>
              <span>TOTAL ASET</span>
              <span>{rp(bs.totalAssets)}</span>
            </div>
          </section>

          <section className={styles.bsCard}>
            <div className={styles.panelHead} style={{ padding: "24px 24px 0" }}>
              <div>
                <h3 className={styles.panelTitle}>Kewajiban & ekuitas</h3>
                <p className={styles.panelSub}>Dari mana asal dana klub</p>
              </div>
            </div>
            <p className={styles.bsGroup}>Kewajiban</p>
            <Lines lines={bs.liabilities} />
            <div className={styles.bsTotal}>
              <span>Total kewajiban</span>
              <span>{acct(bs.totalLiabilities)}</span>
            </div>
            <p className={styles.bsGroup}>Ekuitas</p>
            <Lines lines={bs.equity} />
            <div className={styles.bsTotal}>
              <span>Total ekuitas</span>
              <span>{acct(bs.totalEquity)}</span>
            </div>
            <div className={styles.bsGrand}>
              <span>TOTAL KEWAJIBAN + EKUITAS</span>
              <span>{rp(bs.totalLiabilities + bs.totalEquity)}</span>
            </div>
          </section>
        </div>

        <p className={styles.note}>
          <AdminIcon name="question" size={16} />
          Pos &quot;Otomatis&quot; dihitung dari transaksi (termasuk setor modal & penarikan pemilik). Pos &quot;Manual&quot; (modal, peralatan, utang vendor, piutang) diisi lewat Saldo awal & penyesuaian — setiap perubahan tercatat di log.
        </p>
      </div>
    </>
  );
}
