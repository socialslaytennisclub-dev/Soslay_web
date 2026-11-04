/**
 * Satu-satunya tabel sifat sumber transaksi (finance_transactions.source). Record<TxSource, …> →
 * sumber baru wajib mengisi semua sifat di sini, dan badge, filter, laporan, hak ubah ikut otomatis.
 */
import type { FinanceRole, FinTx, TxSource } from "./types";

type SourceMeta = {
  /** Dicatat sistem dari modul lain / dihitung laporan (badge "Otomatis", read-only, bukti = tautan sistem). */
  auto: boolean;
  /** Boleh diubah / dihapus dari Keuangan (manual & hasil import). */
  editable: boolean;
  /** Tiket per peserta — digabung per sesi di daftar transaksi. */
  ticket: boolean;
  /** Keterangan kecil di daftar transaksi. */
  note: string | null;
  /** Jalur pendapatan di detail event. */
  channel: string;
};

export const SOURCE_META: Record<TxSource, SourceMeta> = {
  manual: { auto: false, editable: true, ticket: false, note: null, channel: "Dicatat manual" },
  import: { auto: false, editable: true, ticket: false, note: "Import jurnal", channel: "Import jurnal" },
  ticket: { auto: true, editable: false, ticket: true, note: "Tiket via sistem", channel: "Payment gateway" },
  ticket_manual_paid: { auto: true, editable: false, ticket: true, note: "Tandai Lunas · bayar manual", channel: "Bayar manual (Tandai Lunas)" },
  kuyy_import: { auto: true, editable: false, ticket: true, note: "Import peserta Kuyy", channel: "Kuyy" },
  shop_order_verified: { auto: true, editable: false, ticket: false, note: "Shop · transfer diverifikasi", channel: "Shop" },
  refund: { auto: true, editable: false, ticket: false, note: "Koreksi refund", channel: "Refund" },
  pg_payout: { auto: true, editable: false, ticket: false, note: "Pencairan payment gateway", channel: "Payment gateway" },
  transfer_fee: { auto: false, editable: false, ticket: false, note: "Biaya transfer", channel: "Dicatat manual" },
  adjustment: { auto: false, editable: false, ticket: false, note: "Penyesuaian", channel: "Penyesuaian" },
  depreciation: { auto: true, editable: false, ticket: false, note: "Penyusutan otomatis", channel: "Sistem" },
  tax: { auto: true, editable: false, ticket: false, note: "PPh otomatis", channel: "Sistem" },
};

export const isAutoSource = (source: TxSource) => SOURCE_META[source].auto;

/**
 * Boleh diubah oleh user ini? Super Admin: semua transaksi manual & import. Pencatat keuangan: hanya
 * transaksi manual yang ia catat sendiri (sama dengan RLS finance_transactions).
 */
export function canEditTx(t: Pick<FinTx, "source" | "createdBy" | "parentId">, role: FinanceRole, userId: string) {
  if (!SOURCE_META[t.source].editable || t.parentId) return false;
  return role === "full" || (t.source === "manual" && t.createdBy === userId);
}
