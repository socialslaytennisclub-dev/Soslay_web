/** View-model daftar transaksi & opsi form — disusun di server, dikirim ke komponen klien. */
import { dateLabel } from "./format";
import { groupTransactions, signedAmount, type TxRow } from "./reports";
import type { FinanceData, FinanceRole, FinCategory, FinTx } from "./types";

export type TxView = {
  key: string;
  id: string;
  code: string;
  date: string;
  dateLabel: string;
  title: string;
  sub: string;
  subWarn: boolean;
  category: string;
  account: string;
  amount: number; // bertanda arus kas
  /** Sumber untuk badge. */
  source: FinTx["source"];
  type: FinTx["type"];
  proof: "auto" | "yes" | "no" | "none";
  editable: boolean;
  grouped: { name: string; amount: number; date: string }[];
  sessionId: string | null;
  sessionLabel: string | null;
  tx: FinTx;
};

const AUTO = new Set(["ticket", "ticket_manual_paid", "kuyy_import", "shop_order_verified", "refund", "pg_payout"]);
const SOURCE_NOTE: Partial<Record<FinTx["source"], string>> = {
  kuyy_import: "Import peserta Kuyy",
  ticket_manual_paid: "Tandai Lunas · bayar manual",
  ticket: "Tiket via sistem",
  shop_order_verified: "Shop · transfer diverifikasi",
  import: "Import jurnal",
  transfer_fee: "Biaya transfer",
};

export function sessionLabel(data: FinanceData, id: string | null): string | null {
  const s = id ? data.sessions.find((x) => x.id === id) : null;
  return s ? `${s.title} · ${dateLabel(s.startsAt.slice(0, 10), false)} · ${s.venueName}` : null;
}

export function toTxViews(data: FinanceData, txs: FinTx[], role: FinanceRole, userId: string): TxView[] {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const short = (id: string | null) => {
    const a = id ? acc.get(id) : null;
    if (!a) return "—";
    return a.type === "payment_gateway" ? "PG" : a.systemKey === "bank_main" ? a.name.replace(/^Bank\s+/i, "") : a.name;
  };
  return groupTransactions(txs).map((row: TxRow): TxView => {
    const t = row.tx;
    const session = t.sessionId ? data.sessions.find((s) => s.id === t.sessionId) : null;
    const auto = AUTO.has(t.source);
    const grouped = row.items.length > 1;
    const title = grouped && session ? `${session.title} · ${session.venueName}` : t.description;
    const noProof = !auto && t.type !== "transfer" && !t.parentId && t.source !== "transfer_fee" && !t.hasProof;
    const sub = grouped
      ? `${row.items.length} tiket · ${SOURCE_NOTE[t.source] ?? "otomatis"}`
      : noProof && t.type === "expense"
        ? "Belum ada bukti"
        : [t.counterparty, t.note, t.type === "transfer" ? "Transfer antar akun" : SOURCE_NOTE[t.source]].filter(Boolean).join(" · ");
    const editable = (t.source === "manual" || t.source === "import") && (role === "full" || t.createdBy === userId);
    return {
      key: row.key,
      id: t.id,
      code: grouped ? `${row.items.length} transaksi` : t.code,
      date: t.date,
      dateLabel: dateLabel(t.date, false),
      title,
      sub,
      subWarn: noProof && t.type === "expense",
      category: t.categoryId ? (cat.get(t.categoryId) ?? "—") : t.type === "owner_withdrawal" ? "Penarikan pemilik" : t.type === "owner_contribution" ? "Setor modal" : "—",
      account: t.type === "transfer" ? `${short(t.accountId)} → ${short(t.toAccountId)}` : (acc.get(t.accountId)?.name ?? "—"),
      amount: grouped ? row.amount : signedAmount(t),
      source: t.source,
      type: t.type,
      proof: auto ? "auto" : t.type === "transfer" || t.type.startsWith("owner_") ? (t.hasProof ? "yes" : "none") : t.hasProof ? "yes" : "no",
      editable: editable && !t.parentId,
      grouped: grouped ? row.items.map((i) => ({ name: i.description, amount: i.amount, date: i.date })) : [],
      sessionId: t.sessionId,
      sessionLabel: sessionLabel(data, t.sessionId),
      tx: t,
    };
  });
}

/** Kategori yang boleh dipilih di form manual. */
export function selectableCategory(data: FinanceData, c: FinCategory) {
  if (c.isArchived) return false;
  return !c.isSystem || (c.systemKey === "tax" && data.settings.taxEnabled);
}

/** Opsi form Catat transaksi. */
export function txFormOptions(data: FinanceData, role: FinanceRole, userName: string) {
  return {
    role,
    userName,
    today: data.today,
    accounts: data.accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, systemKey: a.systemKey })),
    // Kategori sistem tidak bisa dipilih, kecuali PPh saat pajak aktif (= setoran pajak, mengurangi utang
    // pajak). Kategori arsip ikut dikirim supaya transaksi lama tetap bisa diedit tanpa ganti kategori.
    categories: data.categories
      .filter((c) => selectableCategory(data, c) || c.isArchived)
      .map((c) => ({ id: c.id, name: c.systemKey === "tax" ? `${c.name} (setoran)` : c.name, kind: c.kind, systemKey: c.systemKey, archived: c.isArchived })),
    sessions: data.sessions.slice(0, 300).map((s) => ({ id: s.id, label: `${s.title} · ${dateLabel(s.startsAt.slice(0, 10))} · ${s.venueName}` })),
    defaultAccountId: data.settings.defaultBankAccountId ?? data.accounts.find((a) => a.systemKey === "bank_main")?.id ?? null,
  };
}
