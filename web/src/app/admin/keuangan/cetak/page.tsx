import type { Metadata } from "next";
import { PrintOnLoad } from "@/components/admin/orders/PrintOnLoad";
import { monthOf } from "@/lib/finance/reports";
import { buildReportSheets, REPORTS, type ReportKey } from "@/server/admin/finance-export";
import { financePage } from "@/server/admin/finance-page";
import styles from "./print.module.css";

export const metadata: Metadata = { title: "Cetak laporan" };

/** Versi cetak laporan Keuangan (Export PDF): buka dialog cetak → "Simpan sebagai PDF". */
export default async function FinancePrintPage({ searchParams }: PageProps<"/admin/keuangan/cetak">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const raw = await searchParams;
  const m = typeof raw.m === "string" && /^\d{4}-\d{2}$/.test(raw.m) ? raw.m : monthOf(ctx.data.today);
  const reports = String(raw.reports ?? "pnl").split(",").filter((r): r is ReportKey => r in REPORTS);
  const sheets = buildReportSheets(ctx.data, reports, m, ctx.userName);
  return (
    <div className={styles.page}>
      <PrintOnLoad />
      {/* Sidebar & topbar admin tidak ikut tercetak. */}
      <style>{"@media print { #admin-sidebar, header[class*=topbar], [class*=mobileBar] { display: none !important; } }"}</style>
      {sheets.map((s) => {
        const head = s.rows.slice(0, 4);
        const [cols, ...body] = s.rows.slice(5);
        return (
          <section key={s.name} className={styles.sheet}>
            <div className={styles.sheetHead}>
              <strong>{String(head[0][0])}</strong>
              <h1>{String(head[1][0])}</h1>
              <p>{String(head[2][0])}</p>
              <p className={styles.meta}>{String(head[3][0])}</p>
            </div>
            <table>
              <thead>
                <tr>
                  {cols.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r} className={row.length === 1 ? styles.group : /^(Total|Laba|TOTAL|LABA)/.test(String(row[0] ?? "")) ? styles.total : undefined}>
                    {cols.map((_, i) => {
                      const v = row[i];
                      return <td key={i} className={typeof v === "number" ? styles.num : undefined}>{typeof v === "number" ? (v < 0 ? `(${Math.abs(v).toLocaleString("id-ID")})` : v.toLocaleString("id-ID")) : (v ?? "")}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
