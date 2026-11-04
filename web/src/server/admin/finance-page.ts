import "server-only";
import { redirect } from "next/navigation";
import { monthLabel } from "@/lib/finance/format";
import { addMonths, monthOf } from "@/lib/finance/reports";
import type { FinanceData, FinanceRole } from "@/lib/finance/types";
import { getFinanceAccess, getFinanceData } from "./finance-repo";

/**
 * Pintu halaman Keuangan. Tanpa akses → null (layout menampilkan 12u). Halaman laporan ("full")
 * mengalihkan Pencatat keuangan ke Transaksi (12x) — server action & RLS tetap menolak juga.
 */
export async function financePage(level: "full" | "record"): Promise<{ role: FinanceRole; data: FinanceData; userId: string; userName: string } | null> {
  const { role, session, userId } = await getFinanceAccess();
  if (!role) return null;
  if (level === "full" && role !== "full") redirect("/admin/keuangan/transaksi");
  const data = await getFinanceData();
  return { role, data, userId, userName: session.mode === "denied" ? "" : session.name };
}

/** Bulan dari ?m=YYYY-MM (default bulan berjalan) + daftar pilihan bulan (terbaru dulu). */
export function monthParam(data: FinanceData, raw: string | string[] | undefined) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const current = monthOf(data.today);
  const earliest = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), `${current}-01`).slice(0, 7);
  const months: { value: string; label: string }[] = [];
  for (let ym = current; ym >= earliest && months.length < 60; ym = addMonths(ym, -1)) months.push({ value: ym, label: monthLabel(ym) });
  const month = v && /^\d{4}-\d{2}$/.test(v) && v <= current ? v : current;
  if (!months.some((m) => m.value === month)) months.push({ value: month, label: monthLabel(month) });
  return { month, months };
}

/** Import masih bisa dibatalkan (≤ 24 jam, belum dibatalkan). */
export function canUndoImport(batch: { status: string; undoUntil: string }) {
  return batch.status === "imported" && new Date(batch.undoUntil).getTime() > Date.now();
}
