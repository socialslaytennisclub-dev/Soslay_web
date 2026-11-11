/** View-model daftar transaksi & opsi form — disusun di server, dikirim ke komponen klien. */
import { dateLabel } from "./format";
import { groupTransactions, signedAmount, type TxRow } from "./reports";
import { canEditTx, isAutoSource, SOURCE_META } from "./sources";
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
  /** Dicatat otomatis oleh sistem (read-only). */
  auto: boolean;
  type: FinTx["type"];
  proof: "auto" | "yes" | "no" | "none";
  editable: boolean;
  grouped: { name: string; amount: number; date: string }[];
  sessionId: string | null;
  sessionLabel: string | null;
  tx: FinTx;
};

/** Gabung (tiket per sesi) lalu susun view — untuk daftar pendek. Daftar berhalaman: groupTransactions → slice → txViews. */
export function toTxViews(data: FinanceData, txs: FinTx[], role: FinanceRole, userId: string): TxView[] {
  return txViews(data, groupTransactions(txs), role, userId);
}

export function txViews(data: FinanceData, rows: TxRow[], role: FinanceRole, userId: string): TxView[] {
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const short = (id: string | null) => {
    const a = id ? acc.get(id) : null;
    if (!a) return "—";
    return a.type === "payment_gateway" ? "PG" : a.systemKey === "bank_main" ? a.name.replace(/^Bank\s+/i, "") : a.name;
  };
  return rows.map((row): TxView => {
    const t = row.tx;
    const session = t.sessionId ? sessions.get(t.sessionId) : undefined;
    const auto = isAutoSource(t.source);
    const grouped = row.items.length > 1;
    const title = grouped && session ? `${session.title} · ${session.venueName}` : t.description;
    const noProof = !auto && t.type !== "transfer" && !t.parentId && t.source !== "transfer_fee" && !t.hasProof;
    const sub = grouped
      ? `${row.items.length} tiket · ${SOURCE_META[t.source].note ?? "otomatis"}`
      : noProof && t.type === "expense"
        ? "Belum ada bukti"
        : [t.counterparty, t.note, t.type === "transfer" ? "Transfer antar akun" : SOURCE_META[t.source].note].filter(Boolean).join(" · ");
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
      auto,
      type: t.type,
      proof: auto ? "auto" : t.type === "transfer" || t.type.startsWith("owner_") ? (t.hasProof ? "yes" : "none") : t.hasProof ? "yes" : "no",
      editable: canEditTx(t, role, userId),
      grouped: grouped ? row.items.map((i) => ({ name: i.description, amount: i.amount, date: i.date })) : [],
      sessionId: t.sessionId,
      sessionLabel: session ? `${session.title} · ${dateLabel(session.startsAt.slice(0, 10), false)} · ${session.venueName}` : null,
      tx: t,
    };
  });
}

/**
 * Kategori yang boleh dipilih di form transaksi manual — satu aturan untuk server & form:
 * kategori sistem tidak, kecuali PPh saat pajak aktif (= setoran, mengurangi utang pajak);
 * kategori arsip hanya bila memang kategori transaksi yang sedang diedit.
 */
export function selectableCategory(data: FinanceData, c: FinCategory, currentCategoryId?: string | null) {
  if (c.isSystem && !(c.systemKey === "tax" && data.settings.taxEnabled)) return false;
  return !c.isArchived || c.id === currentCategoryId;
}

/** Opsi form Catat transaksi. */
export function txFormOptions(data: FinanceData, role: FinanceRole, userName: string) {
  return {
    role,
    userName,
    today: data.today,
    accounts: data.accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, systemKey: a.systemKey })),
    // Kategori arsip ikut dikirim (ditandai) — form hanya menampilkannya untuk transaksi yang memakainya.
    categories: data.categories
      .filter((c) => selectableCategory(data, c, c.id))
      .map((c) => ({ id: c.id, name: c.systemKey === "tax" ? `${c.name} (setoran)` : c.name, kind: c.kind, systemKey: c.systemKey, archived: c.isArchived })),
    sessions: data.sessions.slice(0, 300).map((s) => ({ id: s.id, label: `${s.title} · ${dateLabel(s.startsAt.slice(0, 10))} · ${s.venueName}` })),
    trips: data.trips.map((t) => ({ id: t.id, label: `${t.title} · ${dateLabel(t.startsOn)}` })),
    defaultAccountId: data.settings.defaultBankAccountId ?? data.accounts.find((a) => a.systemKey === "bank_main")?.id ?? null,
  };
}
