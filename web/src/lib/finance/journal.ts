/**
 * Import jurnal Excel / CSV (§7) — parser murni (dipakai di browser & diuji ulang di server).
 *
 * Format:
 *  - journal: Tanggal, (Ref), Keterangan, Akun, Debet, Kredit — ≥ 2 baris per transaksi, debet = kredit.
 *  - simple : Tanggal, Keterangan, Jumlah (+/−), (Akun) — 1 baris per transaksi.
 * Jenis transaksi diturunkan dari akun kas: kas di debet → pemasukan, kas di kredit → pengeluaran,
 * dua akun kas → transfer. Akun non-kas di file hanya petunjuk; kategori dipilih per transaksi.
 */
import type { CategoryKind, FinCategory } from "./types";

export type ImportFormat = "journal" | "simple";
export type ColumnKey = "date" | "ref" | "description" | "account" | "debit" | "credit" | "amount";
export type ColumnMap = Partial<Record<ColumnKey, number>>;
export type CashKey = "bank_main" | "cash" | "payment_gateway" | "kuyy";

export type ImportTx = {
  index: number; // 1-based, urutan di file
  rowFrom: number; // nomor baris Excel (1-based)
  rowTo: number;
  type: "income" | "expense" | "transfer";
  date: string;
  dateSource: "column" | "description" | "default";
  amount: number;
  description: string;
  hint: string; // akun non-kas di file, mis. "Biaya Produksi"
  account: CashKey;
  toAccount: CashKey | null;
  categoryId: string | null;
  suggestedCategoryId: string | null;
  status: "suggested" | "manual" | "review";
  flags: { duplicateOf?: number; existing?: boolean; doubleIncome?: boolean; goLive?: boolean; payout?: boolean };
  skip: boolean;
};

export type ImportError = { rowFrom: number; rowTo: number; message: string };

export type ParseOptions = {
  format: ImportFormat;
  columns: ColumnMap;
  headerRow: number; // index 0-based baris judul
  period: string; // YYYY-MM
  defaultDate: string; // YYYY-MM-DD
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ── Deteksi format & kolom ───────────────────────────────────────────────────
const HEADER_PATTERNS: Record<ColumnKey, RegExp> = {
  date: /^(tanggal|tgl|date|bulan|month)$/,
  ref: /^(ref|no\.?|nomor|no ref|reference)$/,
  description: /^(keterangan|deskripsi|description|uraian|catatan)$/,
  account: /^(akun|account|nama akun|perkiraan)$/,
  debit: /^(debet|debit|dr)$/,
  credit: /^(kredit|credit|cr)$/,
  amount: /^(jumlah|amount|nominal|nilai)$/,
};

export function detectLayout(rows: string[][]): { format: ImportFormat; headerRow: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cols: ColumnMap = {};
    rows[r].forEach((cell, i) => {
      const c = norm(cell);
      for (const [key, re] of Object.entries(HEADER_PATTERNS) as [ColumnKey, RegExp][]) if (cols[key] === undefined && re.test(c)) cols[key] = i;
    });
    if (cols.description !== undefined && cols.debit !== undefined && cols.credit !== undefined) return { format: "journal", headerRow: r, columns: cols };
    if (cols.description !== undefined && cols.amount !== undefined) return { format: "simple", headerRow: r, columns: cols };
  }
  return null;
}

// ── Angka & tanggal ──────────────────────────────────────────────────────────
/** "5,000,000.00" · "Rp500,000" · "5.000.000" · "5000000" · "(47.000)" → integer Rupiah. NaN bila tak terbaca. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/\s|rp\.?/gi, "");
  if (!s || s === "-") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    s = s.replace(dec === "," ? /\./g : /,/g, "").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  const v = Math.round(Number(s));
  return negative ? -v : v;
}

const MONTH_WORDS: [RegExp, number][] = [
  [/^jan/, 1], [/^feb|^peb/, 2], [/^mar/, 3], [/^apr/, 4], [/^mei|^may/, 5], [/^jun/, 6],
  [/^jul/, 7], [/^agu|^aug|^ags/, 8], [/^sep/, 9], [/^okt|^oct/, 10], [/^nov|^nop/, 11], [/^des|^dec/, 12],
];
const monthWord = (w: string) => MONTH_WORDS.find(([re]) => re.test(w.toLowerCase()))?.[1] ?? null;
const pad = (n: number) => String(n).padStart(2, "0");
const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Sel tanggal lengkap → YYYY-MM-DD; "Aug" (hanya bulan) / kosong → null. */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Serial Excel (hari sejak 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(s);
  if (m && monthWord(m[2])) return validDate(+m[3], monthWord(m[2])!, +m[1]);
  return null;
}

/** "(22 Aug)" / "22 Agu" di keterangan → tanggal bila di bulan periode; tanggal bulan lain diabaikan. */
export function dateFromDescription(description: string, period: string): string | null {
  const [y, pm] = period.split("-").map(Number);
  for (const m of description.matchAll(/(\d{1,2})\s*([a-z]{3,9})\b/gi)) {
    const mon = monthWord(m[2]);
    if (mon === pm) return validDate(y, mon, +m[1]);
  }
  return null;
}

/** Nama akun di file → akun kas sistem (null = akun non-kas / petunjuk kategori). */
export function cashAccountOf(name: string): CashKey | null {
  const n = norm(name);
  if (/kuyy?\b|saldo kuy/.test(n)) return "kuyy";
  if (/payment gateway|gateway|midtrans|xendit|^pg$/.test(n)) return "payment_gateway";
  if (/\bkas\b|cash|petty/.test(n)) return "cash";
  if (/bank|bca|bri|bni|mandiri|rekening/.test(n)) return "bank_main";
  return null;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
type Draft = Omit<ImportTx, "categoryId" | "suggestedCategoryId" | "status" | "flags" | "skip">;

export function parseRows(rows: string[][], opt: ParseOptions): { txs: ImportTx[]; errors: ImportError[]; dataRows: number } {
  const c = opt.columns;
  const cell = (r: string[], k: ColumnKey) => (c[k] === undefined ? "" : (r[c[k]!] ?? "").trim());
  const errors: ImportError[] = [];
  const drafts: Draft[] = [];
  let dataRows = 0;

  const resolveDate = (raw: string, description: string): Pick<Draft, "date" | "dateSource"> => {
    const full = parseDateCell(raw);
    if (full) return { date: full, dateSource: "column" };
    const fromDesc = dateFromDescription(description, opt.period);
    if (fromDesc) return { date: fromDesc, dateSource: "description" };
    return { date: opt.defaultDate, dateSource: "default" };
  };

  if (opt.format === "simple") {
    rows.slice(opt.headerRow + 1).forEach((r, i) => {
      const rowNo = opt.headerRow + 2 + i;
      const description = cell(r, "description");
      const amountRaw = cell(r, "amount");
      if (!description && !amountRaw) return;
      dataRows++;
      const amount = parseAmount(amountRaw);
      if (!description || !Number.isFinite(amount) || amount === 0) {
        errors.push({ rowFrom: rowNo, rowTo: rowNo, message: !description ? "Keterangan kosong" : "Angka tidak terbaca" });
        return;
      }
      const acc = cashAccountOf(cell(r, "account")) ?? "bank_main";
      drafts.push({
        index: drafts.length + 1,
        rowFrom: rowNo,
        rowTo: rowNo,
        type: amount > 0 ? "income" : "expense",
        ...resolveDate(cell(r, "date"), description),
        amount: Math.abs(amount),
        description,
        hint: "",
        account: acc,
        toAccount: null,
      });
    });
  } else {
    type Line = { row: number; account: string; debit: number; credit: number; description: string; date: string };
    let group: Line[] = [];
    const flush = () => {
      if (!group.length) return;
      const lines = group;
      group = [];
      const from = lines[0].row;
      const to = lines[lines.length - 1].row;
      const debit = lines.reduce((s, l) => s + l.debit, 0);
      const credit = lines.reduce((s, l) => s + l.credit, 0);
      if (lines.some((l) => !Number.isFinite(l.debit) || !Number.isFinite(l.credit))) return errors.push({ rowFrom: from, rowTo: to, message: "Angka tidak terbaca" });
      if (lines.length < 2) return errors.push({ rowFrom: from, rowTo: to, message: "Pasangan transaksi kosong" });
      if (debit !== credit) return errors.push({ rowFrom: from, rowTo: to, message: `Debet (${debit.toLocaleString("id-ID")}) ≠ kredit (${credit.toLocaleString("id-ID")})` });
      const cashDebit = lines.filter((l) => l.debit > 0 && cashAccountOf(l.account));
      const cashCredit = lines.filter((l) => l.credit > 0 && cashAccountOf(l.account));
      const hint = [...new Set(lines.filter((l) => !cashAccountOf(l.account)).map((l) => l.account).filter(Boolean))].join(", ");
      const description = lines.find((l) => l.description)?.description ?? "";
      const dateRaw = lines.find((l) => l.date)?.date ?? "";
      let type: Draft["type"];
      let account: CashKey;
      let toAccount: CashKey | null = null;
      let amount: number;
      if (cashDebit.length && cashCredit.length) {
        type = "transfer";
        account = cashAccountOf(cashCredit[0].account)!;
        toAccount = cashAccountOf(cashDebit[0].account)!;
        amount = cashCredit.reduce((s, l) => s + l.credit, 0);
        if (account === toAccount) return errors.push({ rowFrom: from, rowTo: to, message: "Transfer ke akun yang sama" });
      } else if (cashDebit.length) {
        type = "income";
        account = cashAccountOf(cashDebit[0].account)!;
        amount = cashDebit.reduce((s, l) => s + l.debit, 0);
      } else if (cashCredit.length) {
        type = "expense";
        account = cashAccountOf(cashCredit[0].account)!;
        amount = cashCredit.reduce((s, l) => s + l.credit, 0);
      } else {
        return errors.push({ rowFrom: from, rowTo: to, message: "Tidak ada akun kas / bank di pasangan ini" });
      }
      if (amount <= 0) return errors.push({ rowFrom: from, rowTo: to, message: "Jumlah 0" });
      drafts.push({ index: drafts.length + 1, rowFrom: from, rowTo: to, type, ...resolveDate(dateRaw, description), amount, description, hint, account, toAccount });
    };

    rows.slice(opt.headerRow + 1).forEach((r, i) => {
      const rowNo = opt.headerRow + 2 + i;
      const debitRaw = cell(r, "debit");
      const creditRaw = cell(r, "credit");
      const description = cell(r, "description");
      const account = cell(r, "account");
      if (!debitRaw && !creditRaw && !account) {
        if (!description) flush(); // baris kosong memisahkan transaksi
        return;
      }
      dataRows++;
      const line: Line = { row: rowNo, account, debit: parseAmount(debitRaw), credit: parseAmount(creditRaw), description, date: cell(r, "date") };
      const balanced = group.length >= 2 && group.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) === 0;
      const groupDescription = group.find((l) => l.description)?.description;
      // Transaksi baru dimulai saat kelompok sebelumnya sudah seimbang, atau di baris dengan keterangan
      // berbeda (kelompok lama yang belum seimbang jadi baris error). Keterangan boleh diulang di baris pasangan.
      if (balanced || (group.length && description && groupDescription && description !== groupDescription)) flush();
      group.push(line);
    });
    flush();
  }

  return {
    txs: drafts.map((d) => ({ ...d, categoryId: null, suggestedCategoryId: null, status: "review", flags: {}, skip: false })),
    errors,
    dataRows,
  };
}

// ── Saran kategori, duplikat, go-live ────────────────────────────────────────
const kindOf = (t: Pick<ImportTx, "type">): CategoryKind | null => (t.type === "income" ? "income" : t.type === "expense" ? "expense" : null);

/** Kategori dengan kata kunci terpanjang yang cocok (sesuai jenis). */
export function suggestCategory(description: string, kind: CategoryKind, categories: FinCategory[]): FinCategory | null {
  const d = ` ${description.toLowerCase()} `;
  let best: { cat: FinCategory; len: number } | null = null;
  for (const cat of categories) {
    if (cat.kind !== kind || cat.isArchived || cat.isSystem) continue;
    for (const kw of cat.keywords) {
      const k = kw.toLowerCase();
      const hit = k.endsWith(" ") ? d.includes(` ${k}`) : d.includes(k);
      if (hit && (!best || k.length > best.len)) best = { cat, len: k.length };
    }
  }
  return best?.cat ?? null;
}

export type Enrich = {
  categories: FinCategory[];
  /** Bulan yang sudah punya pendapatan tiket otomatis (risiko pendapatan ganda). */
  autoTicketMonths: Set<string>;
  /** Kunci "date|description|amount" transaksi yang sudah ada. */
  existingKeys: Set<string>;
  goLiveDate: string;
  ticketCategoryId: string | null;
};

export const dupKey = (date: string, description: string, amount: number) => `${date}|${description.trim().toLowerCase()}|${amount}`;

export function enrich(txs: ImportTx[], e: Enrich): ImportTx[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const flags: ImportTx["flags"] = {};
    const key = dupKey(t.date, t.description, t.amount);
    if (seen.has(key)) flags.duplicateOf = seen.get(key);
    else seen.set(key, t.index);
    if (e.existingKeys.has(key)) flags.existing = true;
    if (t.date >= e.goLiveDate) flags.goLive = true;
    const kind = kindOf(t);
    let suggested = kind ? suggestCategory(t.description, kind, e.categories) : null;
    if (t.type === "income" && /pencairan|payout/i.test(t.description)) {
      flags.payout = true;
      suggested = null;
    }
    if (suggested && suggested.id === e.ticketCategoryId && e.autoTicketMonths.has(t.date.slice(0, 7))) flags.doubleIncome = true;
    const needsReview = !suggested || flags.doubleIncome || flags.payout;
    return {
      ...t,
      flags,
      suggestedCategoryId: suggested?.id ?? null,
      categoryId: t.type === "transfer" ? null : (suggested?.id ?? null),
      status: t.type === "transfer" ? "suggested" : needsReview ? "review" : "suggested",
    };
  });
}

/** Kata kunci "mirip": kata pertama yang bermakna dari keterangan (≥ 3 huruf). */
export function similarityKey(description: string): string {
  const words = description.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  return words.slice(0, 2).join(" ");
}

/** Terapkan kategori ke transaksi lain berjenis sama dengan kunci kemiripan sama yang belum dipilih manual. */
export function applyToSimilar(txs: ImportTx[], source: ImportTx, categoryId: string): ImportTx[] {
  const key = similarityKey(source.description);
  if (!key) return txs;
  return txs.map((t) =>
    t.index !== source.index && t.type === source.type && t.status !== "manual" && similarityKey(t.description) === key ? { ...t, categoryId, status: "manual" } : t,
  );
}
