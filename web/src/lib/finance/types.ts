/**
 * Tipe data modul Keuangan (ADM-18) — cermin tabel finance_* di supabase/migrations.
 * Laporan dihitung dari tipe ini (lib/finance/reports), jadi sumber datanya (demo ↔ Supabase)
 * bisa diganti tanpa menyentuh komponen.
 */

export type AccountType = "bank" | "payment_gateway" | "cash" | "platform";
export type CategoryKind = "income" | "expense";
export type ReportGroup = "revenue" | "cogs" | "opex" | "tax";
export type TxType = "income" | "expense" | "transfer" | "owner_withdrawal" | "owner_contribution";
export type TxSource =
  | "manual"
  | "import"
  | "ticket"
  | "ticket_manual_paid"
  | "kuyy_import"
  | "shop_order_verified"
  | "refund"
  | "pg_payout"
  | "transfer_fee"
  | "adjustment"
  | "trip_payment"
  | "depreciation"
  | "tax";
export type TxTerm = "dp" | "installment" | "settlement";
export type BalanceItemKey = "capital" | "equipment" | "receivable" | "payable" | "retained_earnings_opening" | "other_asset" | "other_liability";

export type FinAccount = {
  id: string;
  name: string;
  type: AccountType;
  systemKey: string | null;
  accountNoMasked: string | null;
  note: string | null;
  isSystem: boolean;
  isActive: boolean;
  openingBalance: number;
  openingDate: string; // YYYY-MM-DD
};

export type FinCategory = {
  id: string;
  name: string;
  kind: CategoryKind;
  reportGroup: ReportGroup;
  journalAccount: string;
  systemKey: string | null;
  isSystem: boolean;
  isArchived: boolean;
  note: string | null;
  keywords: string[];
};

export type FinTx = {
  id: string;
  code: string;
  type: TxType;
  status: "draft" | "posted";
  date: string; // uang bergerak (YYYY-MM-DD)
  recognizedOn: string; // diakui di Laba Rugi
  amount: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  description: string;
  counterparty: string | null;
  ownerName: string | null;
  note: string | null;
  term: TxTerm | null;
  sessionId: string | null;
  /** Trip Tennis Escape (pembayaran paket bundling, A-10). */
  tripId: string | null;
  source: TxSource;
  sourceRef: string | null;
  parentId: string | null;
  importBatchId: string | null;
  proofName: string | null;
  hasProof: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type BalanceItem = {
  id: string;
  key: BalanceItemKey;
  label: string;
  amount: number;
  effectiveDate: string;
  salvage: number;
  lifeMonths: number;
  note: string | null;
};

export type FinSettings = {
  goLiveDate: string;
  taxEnabled: boolean;
  taxRate: number | null; // persen
  autoTicket: boolean;
  autoManualPaid: boolean;
  autoKuyy: boolean;
  autoShop: boolean;
  autoDepreciation: boolean;
  manualPaidAccountId: string | null;
  defaultBankAccountId: string | null;
};

export type FinTarget = { year: number; netProfitTarget: number; monthly: number[] | null };

/** Sesi yang bisa dikaitkan ke transaksi (dropdown "Kaitkan ke sesi"). */
export type FinSession = {
  id: string;
  title: string;
  typeSlug: string;
  typeLabel: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  participants: number;
  /** Activity bagian dari trip Tennis Escape — di Per event dijumlahkan ke baris trip-nya. */
  tripId: string | null;
};

/** Trip Tennis Escape untuk laporan Per event: pembayaran paket (transaksi trip_id) + activity-nya. */
export type FinTrip = { id: string; title: string; startsOn: string; endsOn: string; packages: number };

export type ImportBatch = { id: string; fileName: string; txTotal: number; importedAt: string; undoUntil: string; status: "draft" | "imported" | "undone" };

export type FinanceData = {
  accounts: FinAccount[];
  categories: FinCategory[];
  transactions: FinTx[];
  balanceItems: BalanceItem[];
  settings: FinSettings;
  targets: FinTarget[];
  sessions: FinSession[];
  trips: FinTrip[];
  batches: ImportBatch[];
  /** "Hari ini" WIB (YYYY-MM-DD) — demo memakai tanggal tetap. */
  today: string;
};

export type FinanceRole = "full" | "recorder";
