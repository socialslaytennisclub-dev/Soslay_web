import "server-only";
import { dateLabel, monthLabel, MONTHS } from "@/lib/finance/format";
import { balanceSheet, posted, profitLoss, yearly, type Pnl } from "@/lib/finance/reports";
import type { FinanceData, FinTx } from "@/lib/finance/types";
import type { Cell, Sheet } from "./xlsx-write";

/** Isi export Keuangan (§8) — dipakai route export (.xlsx / .csv) dan halaman cetak (PDF). */

export const REPORTS = {
  pnl: "Laba rugi",
  balance: "Neraca",
  transactions: "Daftar transaksi",
  yearly: "Laba rugi tahunan",
  journal: "Jurnal umum (debet / kredit)",
} as const;
export type ReportKey = keyof typeof REPORTS;

const TYPE_LABEL: Record<FinTx["type"], string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer: "Transfer",
  owner_withdrawal: "Penarikan pemilik",
  owner_contribution: "Setor modal",
};

function header(report: string, period: string, exporter: string): Cell[][] {
  return [["Soslay Tennis Club"], [report], [`Periode: ${period}`], [`Diekspor ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB oleh ${exporter}`], []];
}

export function transactionRows(data: FinanceData, from: string, to: string): Cell[][] {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  const session = new Map(data.sessions.map((s) => [s.id, s.title]));
  return [
    ["Kode", "Tanggal", "Diakui", "Jenis", "Keterangan", "Kategori", "Akun", "Ke akun", "Vendor / pembayar", "Sesi / event", "Sumber", "Jumlah", "Bukti", "Catatan"],
    ...posted(data)
      .filter((t) => t.date >= from && t.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
      .map((t) => [
        t.code,
        t.date,
        t.recognizedOn,
        TYPE_LABEL[t.type],
        t.description,
        t.categoryId ? (cat.get(t.categoryId) ?? "") : "",
        acc.get(t.accountId) ?? "",
        t.toAccountId ? (acc.get(t.toAccountId) ?? "") : "",
        t.counterparty ?? "",
        t.sessionId ? (session.get(t.sessionId) ?? "") : "",
        t.source,
        t.type === "expense" || t.type === "owner_withdrawal" ? -t.amount : t.amount,
        t.hasProof ? "Ada" : t.source === "manual" && t.type === "expense" ? "Belum" : "",
        t.note ?? "",
      ]),
  ];
}

function pnlRows(p: Pnl, prev: Pnl, labels: [string, string]): Cell[][] {
  const line = (name: string, a: number, b: number, neg = false): Cell[] => [name, neg ? -a : a, neg ? -b : b];
  const find = (list: Pnl["revenue"], id: string) => list.find((l) => l.categoryId === id)?.amount ?? 0;
  const ids = (k: "revenue" | "cogs" | "opex") => [...new Map([...p[k], ...prev[k]].map((l) => [l.categoryId, l.name])).entries()];
  return [
    ["Akun", labels[0], labels[1]],
    ["PENDAPATAN"],
    ...ids("revenue").map(([id, name]) => line(`  ${name}`, find(p.revenue, id), find(prev.revenue, id))),
    line("Total pendapatan", p.totalRevenue, prev.totalRevenue),
    ["HARGA POKOK PENJUALAN"],
    ...ids("cogs").map(([id, name]) => line(`  HPP · ${name}`, find(p.cogs, id), find(prev.cogs, id), true)),
    line("Laba kotor", p.grossProfit, prev.grossProfit),
    ["BEBAN OPERASIONAL"],
    ...ids("opex").map(([id, name]) => line(`  ${name}`, find(p.opex, id), find(prev.opex, id), true)),
    line("Total beban operasional", p.totalOpex, prev.totalOpex, true),
    line("Laba sebelum pajak", p.profitBeforeTax, prev.profitBeforeTax),
    ...(p.tax || prev.tax ? [line("PPh final", p.tax, prev.tax, true)] : []),
    line("LABA BERSIH", p.netProfit, prev.netProfit),
  ];
}

function balanceRows(data: FinanceData, asOf: string): Cell[][] {
  const bs = balanceSheet(data, asOf);
  const block = (title: string, lines: { label: string; amount: number }[], total: number, totalLabel: string): Cell[][] => [[title], ...lines.map((l) => [`  ${l.label}`, l.amount]), [totalLabel, total]];
  return [
    ["Pos", `Per ${dateLabel(asOf)}`],
    ...block("ASET LANCAR", bs.currentAssets, bs.totalCurrentAssets, "Total aset lancar"),
    ...block("ASET TETAP", bs.fixedAssets, bs.totalFixedAssets, "Total aset tetap"),
    ["TOTAL ASET", bs.totalAssets],
    [],
    ...block("KEWAJIBAN", bs.liabilities, bs.totalLiabilities, "Total kewajiban"),
    ...block("EKUITAS", bs.equity, bs.totalEquity, "Total ekuitas"),
    ["TOTAL KEWAJIBAN + EKUITAS", bs.totalLiabilities + bs.totalEquity],
    ...(bs.difference ? [["Selisih (perlu penyesuaian)", bs.difference]] : []),
  ];
}

function yearlyRows(data: FinanceData, year: number): Cell[][] {
  const y = yearly(data, year);
  return [
    ["Bulan", "Pendapatan", "Biaya", "Laba bersih", "Margin %", `Laba ${year - 1}`],
    ...y.months.map((m, i) => (m.started ? [MONTHS[i], m.revenue, m.cost, m.net, m.margin === null ? "" : Math.round(m.margin * 10) / 10, m.prevNet ?? ""] : [MONTHS[i], "—", "—", "—", "—", "—"])),
    ["Total", y.totals.revenue, y.totals.cost, y.totals.net, y.totals.margin === null ? "" : Math.round(y.totals.margin * 10) / 10, y.totals.prevNet],
  ];
}

/**
 * Jurnal umum untuk konsultan pajak — format sama dengan jurnal Excel lama, 2 baris per transaksi:
 * pemasukan → debet kas, kredit akun jurnal kategori; pengeluaran → kebalikannya; transfer → debet tujuan,
 * kredit asal; penarikan pemilik → debet Prive; setor modal → kredit Modal.
 */
export function journalRows(data: FinanceData, from: string, to: string): Cell[][] {
  const cat = new Map(data.categories.map((c) => [c.id, c]));
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  const rows: Cell[][] = [["Tanggal", "Ref", "Keterangan", "Akun", "Debet", "Kredit"]];
  for (const t of posted(data)
    .filter((x) => x.date >= from && x.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))) {
    const cash = acc.get(t.accountId) ?? "Kas";
    const other = t.categoryId ? (cat.get(t.categoryId)?.journalAccount ?? "Lain-lain") : "";
    const amt = Math.abs(t.amount);
    const negative = t.amount < 0; // koreksi otomatis → posisi dibalik
    let debit: string;
    let credit: string;
    switch (t.type) {
      case "income":
        [debit, credit] = [cash, other];
        break;
      case "expense":
        [debit, credit] = [other, cash];
        break;
      case "transfer":
        [debit, credit] = [acc.get(t.toAccountId ?? "") ?? "", cash];
        break;
      case "owner_withdrawal":
        [debit, credit] = ["Prive", cash];
        break;
      default:
        [debit, credit] = [cash, "Modal"];
    }
    if (negative) [debit, credit] = [credit, debit];
    rows.push([t.date, t.code, t.description, debit, amt, ""], ["", "", "", credit, "", amt]);
  }
  return rows;
}

export function buildReportSheets(data: FinanceData, reports: ReportKey[], month: string, exporter: string): Sheet[] {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prevTo = new Date(Date.UTC(Number(prevYm.slice(0, 4)), Number(prevYm.slice(5)), 0)).toISOString().slice(0, 10);
  const asOf = to > data.today ? data.today : to;
  return reports.map((r): Sheet => {
    switch (r) {
      case "pnl":
        return { name: "Laba rugi", widths: [40, 18, 18], rows: [...header(REPORTS.pnl, monthLabel(month), exporter), ...pnlRows(profitLoss(data, from, to), profitLoss(data, `${prevYm}-01`, prevTo), [monthLabel(month, true), monthLabel(prevYm, true)])] };
      case "balance":
        return { name: "Neraca", widths: [40, 20], rows: [...header(REPORTS.balance, `per ${dateLabel(asOf)}`, exporter), ...balanceRows(data, asOf)] };
      case "yearly":
        return { name: `Tahunan ${y}`, widths: [14, 18, 18, 18, 10, 18], rows: [...header(REPORTS.yearly, String(y), exporter), ...yearlyRows(data, y)] };
      case "journal":
        return { name: "Jurnal", widths: [12, 16, 44, 22, 16, 16], rows: [...header(REPORTS.journal, monthLabel(month), exporter), ...journalRows(data, from, to)] };
      default:
        return { name: "Transaksi", widths: [16, 12, 12, 14, 44, 26, 18, 18, 22, 28, 14, 16, 8, 30], rows: [...header(REPORTS.transactions, monthLabel(month), exporter), ...transactionRows(data, from, to)] };
    }
  });
}
