import { monthOf } from "@/lib/finance/reports";
import { buildReportSheets, REPORTS, type ReportKey } from "@/server/admin/finance-export";
import { getFinanceAccess, getFinanceData } from "@/server/admin/finance-repo";
import { buildXlsx } from "@/server/admin/xlsx-write";

/**
 * GET /admin/keuangan/export?reports=pnl,balance,transactions,yearly,journal&format=xlsx|csv&m=YYYY-MM
 * Khusus Super Admin (403 untuk role lain — bukan hanya disembunyikan di UI).
 */
export async function GET(request: Request) {
  const { role, session } = await getFinanceAccess();
  if (role !== "full") return new Response("Akses Keuangan khusus Super Admin.", { status: 403 });
  const url = new URL(request.url);
  const data = await getFinanceData();
  const m = url.searchParams.get("m");
  const month = m === "all" || (m && /^\d{4}-\d{2}$/.test(m)) ? m : monthOf(data.today);
  const reports = (url.searchParams.get("reports") ?? "transactions").split(",").filter((r): r is ReportKey => r in REPORTS);
  if (!reports.length) return new Response("Pilih laporan.", { status: 400 });
  const exporter = session.mode === "denied" ? "" : session.name;
  const sheets = buildReportSheets(data, reports, month, exporter);
  const stamp = `${month}-${new Date().toISOString().slice(0, 10)}`;

  if (url.searchParams.get("format") === "csv") {
    const sheet = sheets.find((s) => s.name === "Transaksi" || s.name === "Jurnal") ?? sheets[0];
    const csv = sheet.rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="soslay-${sheet.name.toLowerCase()}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const name = reports.length === 1 ? reports[0] : "laporan";
  return new Response(new Uint8Array(buildXlsx(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="soslay-keuangan-${name}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
