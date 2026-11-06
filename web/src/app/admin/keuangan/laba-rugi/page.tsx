import type { Metadata } from "next";
import { ExportButton } from "@/components/admin/finance/ExportDialog";
import styles from "@/components/admin/finance/Finance.module.css";
import { FinanceTabs, PageHead, SegmentLinks } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon, type AdminIconName } from "@/components/admin/ui/AdminIcon";
import { cx } from "@/lib/cx";
import { acct, monthLabel, pct, rpShort } from "@/lib/finance/format";
import { pctChange, periodFor, profitLoss, type Pnl, type PnlLine } from "@/lib/finance/reports";
import { one } from "@/server/admin/query";
import { financePage, monthParam } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Laba Rugi" };

type Mode = "month" | "quarter" | "year";
const MODE_LABEL: Record<Mode, string> = { month: "Bulanan", quarter: "Kuartal", year: "Tahunan" };

function label(mode: Mode, p: { label: string }) {
  return mode === "month" ? monthLabel(p.label, true) : p.label;
}

/** Admin / 12d — Laporan laba rugi dengan pembanding periode sebelumnya, sorotan & margin. */
export default async function ProfitLossPage({ searchParams }: PageProps<"/admin/keuangan/laba-rugi">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role } = ctx;
  const raw = await searchParams;
  const { month, months } = monthParam(data, raw.m);
  const mode = (["quarter", "year"].includes(one(raw.mode) ?? "") ? one(raw.mode) : "month") as Mode;
  const { current, previous } = periodFor(mode, month);
  const p = profitLoss(data, current.from, current.to);
  const q = profitLoss(data, previous.from, previous.to);
  const curLabel = label(mode, current);
  const prevLabel = label(mode, previous);
  const insights = highlights(p, q);
  const hasDep = p.opex.some((l) => l.systemKey === "depreciation");

  const lineRow = (l: PnlLine, list: PnlLine[], negative: boolean, hint?: string) => {
    const before = list.find((x) => x.categoryId === l.categoryId)?.amount ?? 0;
    return (
      <tr key={l.categoryId}>
        <td>
          {l.group === "cogs" ? "HPP merchandise" : l.name}
          {l.group === "cogs" && <span className={styles.inlineHint}>{l.name}</span>}
          {l.auto && l.group === "revenue" && <span className={cx(styles.pill, styles.pillAuto)} style={{ marginLeft: 8 }}>Otomatis</span>}
          {l.systemKey === "depreciation" && <span className={styles.inlineHint}>otomatis</span>}
          {hint && <span className={styles.inlineHint}>{hint}</span>}
        </td>
        <td>{acct(l.amount, negative)}</td>
        <td className={styles.prev}>{acct(before, negative)}</td>
        <td>{pct(pctChange(l.amount, before), 1, true)}</td>
      </tr>
    );
  };
  const missing = (list: PnlLine[], other: PnlLine[]) => other.filter((o) => !list.some((l) => l.categoryId === o.categoryId)).map((o) => ({ ...o, amount: 0 }));
  const totalRow = (name: string, a: number, b: number, negative = false, shade = false, hint?: string) => (
    <tr className={cx(styles.totalRow, shade && styles.shadeRow)}>
      <td>
        {name}
        {hint && <span className={styles.inlineHint}>{hint}</span>}
      </td>
      <td>{acct(a, negative)}</td>
      <td className={styles.prev}>{acct(b, negative)}</td>
      <td>{pct(pctChange(a, b), 1, true)}</td>
    </tr>
  );

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Laba Rugi" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          title="Laba rugi"
          subtitle="Pendapatan dikurangi semua biaya pada periode terpilih — dihitung otomatis dari transaksi."
          actions={<ExportButton month={month} preset={["pnl"]} label="Export" />}
        />
        <FinanceTabs active="laba-rugi" role={role} query={`?m=${month}`} />
        <div className={styles.toolbar}>
          <SegmentLinks
            label="Periode"
            active={mode}
            items={(Object.keys(MODE_LABEL) as Mode[]).map((m) => ({ key: m, label: MODE_LABEL[m], href: `/admin/keuangan/laba-rugi?m=${month}${m === "month" ? "" : `&mode=${m}`}` }))}
          />
          <ParamSelect name="m" value={month} options={months} label="Periode" />
          <span className={styles.chipNote}>
            <AdminIcon name="arrows-down-up" size={14} /> Bandingkan: {prevLabel}
          </span>
        </div>

        <div className={styles.gridSide}>
          <section className={cx(styles.panel, styles.panelFlush)}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Laporan laba rugi</h3>
                <p className={styles.panelSub}>
                  Soslay Tennis Club · {current.from.split("-").reverse().join("/")} – {current.to.split("-").reverse().join("/")}
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.report}>
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th>{curLabel}</th>
                    <th>{prevLabel}</th>
                    <th>Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={styles.groupRow}>
                    <td colSpan={4}>Pendapatan</td>
                  </tr>
                  {[...p.revenue, ...missing(p.revenue, q.revenue)].map((l) => lineRow(l, q.revenue, false))}
                  {totalRow("Total pendapatan", p.totalRevenue, q.totalRevenue)}
                  <tr className={styles.groupRow}>
                    <td colSpan={4}>Harga pokok penjualan</td>
                  </tr>
                  {[...p.cogs, ...missing(p.cogs, q.cogs)].map((l) => lineRow(l, q.cogs, true))}
                  {totalRow("Laba kotor", p.grossProfit, q.grossProfit, false, true, p.grossMargin === null ? undefined : `margin ${pct(p.grossMargin)}`)}
                  <tr className={styles.groupRow}>
                    <td colSpan={4}>Beban operasional</td>
                  </tr>
                  {[...p.opex, ...missing(p.opex, q.opex)].map((l) => lineRow(l, q.opex, true, p.totalRevenue && l.amount / p.totalRevenue > 0.3 ? `${pct((l.amount / p.totalRevenue) * 100)} dari pendapatan` : undefined))}
                  {totalRow("Total beban operasional", p.totalOpex, q.totalOpex, true)}
                  {totalRow("Laba sebelum pajak", p.profitBeforeTax, q.profitBeforeTax, false, true)}
                  {data.settings.taxEnabled && totalRow(`PPh final (${data.settings.taxRate ?? 0}%)`, p.tax, q.tax, true)}
                  <tr className={styles.netRow}>
                    <td>LABA BERSIH</td>
                    <td>{acct(p.netProfit)}</td>
                    <td>{acct(q.netProfit)}</td>
                    <td>
                      <span className={cx(styles.pill, p.netProfit >= q.netProfit ? styles.pillLime : styles.pillPink)}>{pct(pctChange(p.netProfit, q.netProfit), 1, true)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.stack}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Sorotan {curLabel}</h3>
                  <p className={styles.panelSub}>Dibanding {prevLabel}</p>
                </div>
              </div>
              <div className={styles.insights}>
                {insights.map((i) => (
                  <div key={i.title} className={styles.insight}>
                    <span className={cx(styles.insightIcon, i.tone === "warn" && styles.insightWarn, i.tone === "down" && styles.insightDown)}>
                      <AdminIcon name={i.icon} size={16} />
                    </span>
                    <div>
                      <strong>{i.title}</strong>
                      <p>{i.body}</p>
                    </div>
                  </div>
                ))}
                {!insights.length && <p className={styles.muted}>Belum cukup data untuk sorotan.</p>}
              </div>
            </section>

            <section className={styles.panel}>
              <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>
                Margin
              </h3>
              <div className={styles.bars}>
                {(
                  [
                    ["Margin kotor", p.grossMargin, false],
                    ["Margin bersih", p.netMargin, true],
                  ] as [string, number | null, boolean][]
                ).map(([name, v, navy]) => (
                  <div key={String(name)} className={styles.barRow} style={{ gridTemplateColumns: "1fr auto" }}>
                    <span>{name}</span>
                    <strong>{pct(v)}</strong>
                    <span className={styles.track}>
                      <span className={cx(styles.fill, navy && styles.fillNavy)} style={{ display: "block", width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <p className={styles.muted} style={{ marginTop: 12 }}>
                {prevLabel}: margin bersih {pct(q.netMargin)}
              </p>
            </section>

            <section className={styles.panel} style={{ background: "transparent", border: 0, padding: "0 8px" }}>
              <h3 className={styles.panelTitle} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <AdminIcon name="question" size={18} /> Cara sistem menghitung
              </h3>
              <ul className={styles.howList}>
                <li>Tiket activity diakui di tanggal uang diterima: impor peserta Kuyy, Tandai Lunas, atau DP/pelunasan yang dicatat manual. Data lama (sebelum 1 Des 2026): withdraw Kuyy = pendapatan.</li>
                <li>Merchandise diakui saat transfer order diverifikasi. HPP = pengeluaran kategori Produksi merchandise (dibebankan saat dibeli).</li>
                {hasDep || data.settings.autoDepreciation ? <li>Penyusutan peralatan dihitung otomatis tiap akhir bulan dari pos Peralatan di Neraca.</li> : null}
                <li>{data.settings.taxEnabled ? `PPh final ${data.settings.taxRate}% × total pendapatan.` : "Pajak belum diaktifkan — baris PPh tampil setelah diatur di Pengaturan keuangan."}</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

type Insight = { title: string; body: string; icon: AdminIconName; tone?: "warn" | "down" };

/** 3 sorotan otomatis: perubahan laba bersih, kategori biaya > 30% pendapatan, perubahan biaya terbesar. */
function highlights(p: Pnl, q: Pnl): Insight[] {
  const out: Insight[] = [];
  const netChange = pctChange(p.netProfit, q.netProfit);
  if (netChange !== null) {
    // Laba naik → pendapatan yang paling naik; laba turun → pos yang paling menekan laba
    // (pendapatan turun atau biaya naik), supaya penjelasannya searah dengan perubahan laba.
    const before = (list: PnlLine[], id: string) => list.find((x) => x.categoryId === id)?.amount ?? 0;
    const effects = [
      ...p.revenue.map((l) => ({ name: l.name, d: l.amount - before(q.revenue, l.categoryId) })),
      ...q.revenue.filter((l) => !p.revenue.some((x) => x.categoryId === l.categoryId)).map((l) => ({ name: l.name, d: -l.amount })),
      ...[...p.cogs, ...p.opex].map((l) => ({ name: l.name, d: -(l.amount - before([...q.cogs, ...q.opex], l.categoryId)) })),
    ];
    const up = netChange >= 0;
    const drivers = effects
      .filter((x) => (up ? x.d > 0 : x.d < 0))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 2);
    out.push({
      title: `Laba bersih ${up ? "naik" : "turun"} ${pct(Math.abs(netChange))}`,
      body: drivers.length ? `${up ? "Didorong" : "Ditekan"} ${drivers.map((x) => `${x.name.toLowerCase()} (${x.d > 0 ? "+" : "−"}${rpShort(Math.abs(x.d)).replace("−", "")} ke laba)`).join(" & ")}.` : up ? "Biaya lebih rendah dari periode pembanding." : "Pendapatan tidak naik cukup untuk menutup biaya.",
      icon: netChange >= 0 ? "trend-up" : "trend-down",
      tone: netChange >= 0 ? undefined : "down",
    });
  }
  const heavy = [...p.cogs, ...p.opex].filter((l) => p.totalRevenue && l.amount / p.totalRevenue > 0.3).sort((a, b) => b.amount - a.amount)[0];
  if (heavy) out.push({ title: `${heavy.name} ${pct((heavy.amount / p.totalRevenue) * 100, 0)} dari pendapatan`, body: "Biaya terbesar. Pantau rasionya sebelum menambah kapasitas.", icon: "warning-circle", tone: "warn" });
  const moves = [...p.cogs, ...p.opex]
    .map((l) => ({ l, before: [...q.cogs, ...q.opex].find((x) => x.categoryId === l.categoryId)?.amount ?? 0 }))
    .filter((x) => x.before > 0 && x.l.categoryId !== heavy?.categoryId)
    .map((x) => ({ ...x, change: pctChange(x.l.amount, x.before)! }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (moves && Math.abs(moves.change) >= 5)
    out.push({
      title: `${moves.l.name} ${moves.change < 0 ? "turun" : "naik"} ${pct(Math.abs(moves.change))}`,
      body: `${rpShort(moves.l.amount)} vs ${rpShort(moves.before)}${moves.change < 0 && p.totalRevenue >= q.totalRevenue ? ", sementara pendapatan tetap naik" : ""}.`,
      icon: moves.change < 0 ? "trend-down" : "trend-up",
      tone: moves.change < 0 ? "down" : "warn",
    });
  return out.slice(0, 3);
}
