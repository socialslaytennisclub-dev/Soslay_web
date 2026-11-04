import type { Metadata } from "next";
import Link from "next/link";
import { YearChart } from "@/components/admin/finance/Charts";
import { ExportButton } from "@/components/admin/finance/ExportDialog";
import styles from "@/components/admin/finance/Finance.module.css";
import { FinanceTabs, PageHead } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { TargetButton } from "@/components/admin/finance/TargetButton";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { cx } from "@/lib/cx";
import { MONTHS, MONTHS_SHORT, num, pct, rpShort } from "@/lib/finance/format";
import { deltaPct, pctChange, yearly } from "@/lib/finance/reports";
import { one } from "@/server/admin/query";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Laba rugi tahunan" };

/** Admin / 12f — Laba rugi tahunan: tren 12 bulan, target, proyeksi akhir tahun, biaya terbesar. */
export default async function YearlyPage({ searchParams }: PageProps<"/admin/keuangan/tahunan">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role } = ctx;
  const raw = await searchParams;
  const thisYear = Number(data.today.slice(0, 4));
  const firstYear = Number((data.transactions.at(-1)?.date ?? data.today).slice(0, 4));
  const year = Math.min(Math.max(Number(one(raw.y)) || thisYear, firstYear), thisYear);
  const compare = one(raw.cmp) !== "0";
  const y = yearly(data, year);
  const elapsedLabel = y.elapsed ? `Jan–${MONTHS_SHORT[y.elapsed - 1]}` : "—";
  const target = data.targets.find((t) => t.year === year);
  const years = Array.from({ length: thisYear - Math.min(firstYear, thisYear) + 1 }, (_, i) => thisYear - i);
  const avg3 = y.months.filter((m) => m.started).slice(-3);
  const remaining = 12 - y.elapsed;

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Tahunan" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead title="Laba rugi tahunan" subtitle="Pantau tren pendapatan, biaya & laba bersih per bulan sepanjang tahun." actions={<ExportButton month={`${year}-${String(Math.max(y.elapsed, 1)).padStart(2, "0")}`} preset={["yearly"]} label="Export" />} />
        <FinanceTabs active="tahunan" role={role} />
        <div className={styles.toolbar}>
          <ParamSelect name="y" value={String(year)} options={years.map((v) => ({ value: String(v), label: `Tahun ${v}` }))} label="Tahun" />
          <Link href={`/admin/keuangan/tahunan?y=${year}${compare ? "&cmp=0" : ""}`} scroll={false} className={cx(styles.chipNote, compare && styles.chipOk)}>
            <AdminIcon name={compare ? "check-circle" : "x"} size={14} /> Bandingkan dengan {year - 1}
          </Link>
          {remaining > 0 && (
            <span className={styles.chipNote}>
              {elapsedLabel} · {MONTHS_SHORT.slice(y.elapsed).join(" & ").replace(/ & (?=.* & )/g, ", ")} belum berjalan
            </span>
          )}
        </div>

        <div className={styles.kpis}>
          <Kpi icon="trend-up" label={`Pendapatan ${elapsedLabel}`} value={rpShort(y.totals.revenue)} delta={deltaPct(y.totals.revenue, y.totals.prevRevenue)} note={`vs ${rpShort(y.totals.prevRevenue)} periode sama ${year - 1}`} />
          <Kpi icon="trend-down" label={`Total biaya ${elapsedLabel}`} value={rpShort(y.totals.cost)} note="HPP & beban operasional" />
          <Kpi icon="money" label={`Laba bersih ${elapsedLabel}`} value={rpShort(y.totals.net)} delta={deltaPct(y.totals.net, y.totals.prevNet)} note={`Margin ${pct(y.totals.margin)} · ${year - 1}: ${rpShort(y.totals.prevNet)}`} />
          <Kpi icon="star" label="Bulan terbaik" value={y.best ? MONTHS[Number(y.best.ym.slice(5)) - 1] : "—"} note={y.best ? `Laba ${rpShort(y.best.net)} · margin ${pct(y.best.margin)}` : "Belum ada data"} />
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Tren bulanan {year}</h3>
              <p className={styles.panelSub}>Batang = pendapatan & biaya · garis = laba bersih · klik bulan untuk laporan bulanan</p>
            </div>
            <div className={styles.legend}>
              <span>
                <i className={styles.dot} style={{ background: "var(--color-indigo-600)" }} /> Pendapatan
              </span>
              <span>
                <i className={styles.dot} style={{ background: "var(--color-indigo-150, #c9cbff)" }} /> Biaya
              </span>
              <span>
                <i className={styles.dot} style={{ background: "var(--color-navy-900)", height: 3 }} /> Laba bersih {year}
              </span>
              {compare && (
                <span>
                  <i className={styles.dot} style={{ background: "var(--color-indigo-500)", height: 3 }} /> Laba bersih {year - 1}
                </span>
              )}
            </div>
          </div>
          <YearChart months={y.months} compare={compare} hrefFor={(ym) => `/admin/keuangan/laba-rugi?m=${ym}`} />
        </section>

        <div className={styles.gridSide}>
          <section className={cx(styles.panel, styles.panelFlush)}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Rincian per bulan</h3>
                <p className={styles.panelSub}>Klik bulan untuk membuka laporan laba rugi bulanan</p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th className={styles.num}>Pendapatan</th>
                    <th className={styles.num}>Biaya</th>
                    <th className={styles.num}>Laba bersih</th>
                    <th className={styles.num}>Margin</th>
                    {compare && <th className={styles.num}>Laba vs {year - 1}</th>}
                  </tr>
                </thead>
                <tbody>
                  {y.months.map((m, i) => (
                    <tr key={m.ym} className={cx(m.ym === y.best?.ym && styles.rowLime)}>
                      <td>
                        {m.started ? (
                          <Link className={styles.strong} href={`/admin/keuangan/laba-rugi?m=${m.ym}`}>
                            {MONTHS[i]}
                          </Link>
                        ) : (
                          <span className={styles.muted}>{MONTHS[i]}</span>
                        )}
                      </td>
                      <td className={styles.num}>{m.started ? num(m.revenue) : "—"}</td>
                      <td className={cx(styles.num, styles.prev)}>{m.started ? num(m.cost) : "—"}</td>
                      <td className={cx(styles.num, styles.strong, m.net < 0 && styles.neg)}>{m.started ? (m.net < 0 ? `−${num(m.net)}` : num(m.net)) : "—"}</td>
                      <td className={styles.num}>{m.started ? pct(m.margin) : "—"}</td>
                      {compare && <td className={styles.num}>{m.started && m.prevNet !== null ? pct(pctChange(m.net, m.prevNet), 1, true) : "—"}</td>}
                    </tr>
                  ))}
                  <tr className={styles.netRow}>
                    <td>Total</td>
                    <td className={styles.num}>{num(y.totals.revenue)}</td>
                    <td className={styles.num}>{num(y.totals.cost)}</td>
                    <td className={styles.num} style={{ color: "var(--color-lime-500)" }}>
                      {y.totals.net < 0 ? "−" : ""}
                      {num(y.totals.net)}
                    </td>
                    <td className={styles.num}>{pct(y.totals.margin)}</td>
                    {compare && <td className={styles.num}>{pct(pctChange(y.totals.net, y.totals.prevNet), 1, true)}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.stack}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Target laba {year}</h3>
                  <p className={styles.muted}>Ditetapkan Super Admin</p>
                </div>
                <TargetButton year={year} amount={target?.netProfitTarget ?? 0} monthly={target?.monthly ?? null} />
              </div>
              {y.target ? (
                <>
                  <p className={styles.bigValue}>
                    {rpShort(y.totals.net)} <span className={styles.muted}>/ {rpShort(y.target.amount)}</span>
                  </p>
                  <span className={styles.track} style={{ display: "block", margin: "12px 0" }}>
                    <span className={styles.fill} style={{ display: "block", width: `${Math.max(0, Math.min(100, y.target.reached ?? 0))}%` }} />
                  </span>
                  <p className={styles.legend} style={{ justifyContent: "space-between" }}>
                    <strong>{pct(y.target.reached)} tercapai</strong>
                    <span>Sisa {rpShort(y.target.remaining)}</span>
                  </p>
                </>
              ) : (
                <p className={styles.muted}>Belum ada target — klik Ubah untuk menetapkan.</p>
              )}
            </section>

            {remaining > 0 && year === Number(data.today.slice(0, 4)) && (
              <section className={styles.dark}>
                <p>Proyeksi akhir tahun</p>
                <p className={styles.big}>±{rpShort(y.projection)}</p>
                <p>
                  Laba {elapsedLabel} + rata-rata {avg3.length} bulan terakhir ({rpShort(avg3.reduce((s, m) => s + m.net, 0) / Math.max(avg3.length, 1))}) × {remaining} bulan tersisa.
                  {y.target ? (y.projection >= y.target.amount ? ` Melewati target ±${rpShort(y.projection - y.target.amount)}.` : ` Kurang ±${rpShort(y.target.amount - y.projection)} dari target.`) : ""}
                </p>
              </section>
            )}

            <section className={styles.panel}>
              <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>
                Biaya terbesar {year}
              </h3>
              <div className={styles.bars}>
                {y.topCosts.map((c, i) => (
                  <div key={c.name} className={styles.barRow} style={{ gridTemplateColumns: "1fr auto" }}>
                    <span>{c.name === "Produksi merchandise" ? "HPP merchandise" : c.name}</span>
                    <strong>{rpShort(c.amount)}</strong>
                    <span className={styles.track}>
                      <span className={cx(styles.fill, i === 0 && styles.fillNavy)} style={{ display: "block", width: `${c.share}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <p className={styles.muted} style={{ marginTop: 12 }}>
                Persentase dari total biaya {elapsedLabel}.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

