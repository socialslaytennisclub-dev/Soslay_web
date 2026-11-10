/**
 * Perhitungan laporan Keuangan (§6) — fungsi murni di atas FinanceData, dipakai halaman admin,
 * export, dan uji. Tidak ada debet/kredit: laporan diturunkan dari jenis + kategori + akun.
 *
 * - Laba Rugi memakai tanggal diakui (recognizedOn); saldo akun memakai tanggal uang bergerak.
 * - Penyusutan (A-5) & PPh final (A-6) dihitung di sini sebagai baris virtual per akhir bulan,
 *   jadi selalu konsisten dengan pos peralatan & pengaturan pajak.
 * - Transaksi kategori PPh yang dicatat manual = setoran pajak (mengurangi utang pajak), bukan beban.
 */
import { isAutoSource, SOURCE_META } from "./sources";
import type { BalanceItem, FinAccount, FinCategory, FinanceData, FinTx, ReportGroup } from "./types";

// ── Tanggal (string YYYY-MM-DD / YYYY-MM) ─────────────────────────────────────
export const monthOf = (d: string) => d.slice(0, 7);
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
export const firstDay = (ym: string) => `${ym}-01`;
const between = (d: string, from: string, to: string) => d >= from && d <= to;
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
export const pctChange = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / Math.abs(before)) * 100);
/** Perubahan % dibulatkan 1 desimal untuk badge KPI (undefined = tidak ada pembanding). */
export const deltaPct = (now: number, before: number): number | undefined => {
  const v = pctChange(now, before);
  return v === null ? undefined : Math.round(v * 10) / 10;
};

export type Period = { from: string; to: string; label: string };

/** Periode bulanan / kuartal / tahunan yang memuat `ym`, plus pembanding sebelumnya. */
export function periodFor(mode: "month" | "quarter" | "year", ym: string): { current: Period; previous: Period } {
  const [y, m] = ym.split("-").map(Number);
  if (mode === "year") {
    return {
      current: { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) },
      previous: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) },
    };
  }
  if (mode === "quarter") {
    const q = Math.floor((m - 1) / 3);
    const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}`;
    const prevStart = addMonths(start, -3);
    const pq = Math.floor((Number(prevStart.slice(5)) - 1) / 3);
    return {
      current: { from: firstDay(start), to: lastDay(addMonths(start, 2)), label: `Q${q + 1} ${y}` },
      previous: { from: firstDay(prevStart), to: lastDay(addMonths(prevStart, 2)), label: `Q${pq + 1} ${prevStart.slice(0, 4)}` },
    };
  }
  const prev = addMonths(ym, -1);
  return {
    current: { from: firstDay(ym), to: lastDay(ym), label: ym },
    previous: { from: firstDay(prev), to: lastDay(prev), label: prev },
  };
}

// ── Baris virtual: penyusutan & pajak ─────────────────────────────────────────
export function monthlyDepreciation(item: BalanceItem): number {
  if (item.key !== "equipment" || item.lifeMonths <= 0) return 0;
  return Math.round((item.amount - item.salvage) / item.lifeMonths);
}

/** Penyusutan peralatan untuk bulan `ym` (dicatat di hari terakhirnya). */
function depreciationForMonth(items: BalanceItem[], ym: string): number {
  let total = 0;
  for (const it of items) {
    const per = monthlyDepreciation(it);
    if (!per) continue;
    const start = monthOf(it.effectiveDate); // mulai disusutkan di bulan pembelian
    const idx = monthsBetween(start, ym);
    if (idx >= 0 && idx < it.lifeMonths) total += per;
  }
  return total;
}

/** Akumulasi penyusutan s.d. tanggal `asOf` (bulan yang hari terakhirnya ≤ asOf). */
export function accumulatedDepreciation(data: FinanceData, asOf: string): number {
  if (!data.settings.autoDepreciation) return 0;
  let total = 0;
  for (const it of data.balanceItems) {
    const per = monthlyDepreciation(it);
    if (!per || it.effectiveDate > asOf) continue;
    let months = monthsBetween(monthOf(it.effectiveDate), monthOf(asOf));
    if (lastDay(monthOf(asOf)) <= asOf) months += 1;
    total += per * Math.min(Math.max(months, 0), it.lifeMonths);
  }
  return total;
}

/** Hitung sekali per FinanceData (data satu request tidak pernah diubah). */
function memo<T>(fn: (data: FinanceData) => T) {
  const cache = new WeakMap<FinanceData, T>();
  return (data: FinanceData): T => {
    if (!cache.has(data)) cache.set(data, fn(data));
    return cache.get(data)!;
  };
}

const catBy = memo((data) => new Map(data.categories.map((c) => [c.id, c])));
export const systemCategory = (data: FinanceData, key: string) => data.categories.find((c) => c.systemKey === key) ?? null;

/** Transaksi yang dihitung laporan: terposting (draf berulang tidak ikut). */
export const posted = memo((data) => data.transactions.filter((t) => t.status === "posted"));

/** Transaksi terposting per sesi (laporan Per event & detail event). */
export const postedBySession = memo((data) => {
  const map = new Map<string, FinTx[]>();
  for (const t of posted(data)) {
    if (!t.sessionId) continue;
    const list = map.get(t.sessionId);
    if (list) list.push(t);
    else map.set(t.sessionId, [t]);
  }
  return map;
});

// ── Laba Rugi ────────────────────────────────────────────────────────────────
export type PnlLine = { categoryId: string; name: string; amount: number; group: ReportGroup; auto: boolean; systemKey: string | null };
export type Pnl = {
  revenue: PnlLine[];
  cogs: PnlLine[];
  opex: PnlLine[];
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalOpex: number;
  profitBeforeTax: number;
  tax: number;
  netProfit: number;
  grossMargin: number | null;
  netMargin: number | null;
  /** Pengeluaran total = HPP + beban + pajak. */
  totalExpense: number;
};


/**
 * Indeks harian (dibuat sekali per FinanceData): tanggal diakui → total per kategori. Laporan yang
 * memanggil profitLoss berkali-kali (Tahunan: 25×, Neraca: dari awal data) cukup menjumlahkan hari,
 * tidak memindai ulang semua transaksi.
 */
type DayTotals = Map<string, { amount: number; auto: boolean }>;
const dayIndexCache = new WeakMap<FinanceData, { days: string[]; byDay: Map<string, DayTotals> }>();
function dayIndex(data: FinanceData) {
  let idx = dayIndexCache.get(data);
  if (idx) return idx;
  const cats = catBy(data);
  const byDay = new Map<string, DayTotals>();
  for (const t of posted(data)) {
    if (!t.categoryId || (t.type !== "income" && t.type !== "expense")) continue;
    const cat = cats.get(t.categoryId);
    if (!cat || cat.reportGroup === "tax") continue; // setoran pajak → utang, bukan beban
    const day = byDay.get(t.recognizedOn) ?? new Map();
    const cell = day.get(t.categoryId) ?? { amount: 0, auto: false };
    cell.amount += t.amount;
    cell.auto ||= isAutoSource(t.source);
    day.set(t.categoryId, cell);
    byDay.set(t.recognizedOn, day);
  }
  idx = { days: [...byDay.keys()].sort(), byDay };
  dayIndexCache.set(data, idx);
  return idx;
}

/** Hari-hari berdata dalam [from, to] (pencarian biner pada daftar hari terurut). */
function daysIn(data: FinanceData, from: string, to: string): DayTotals[] {
  const { days, byDay } = dayIndex(data);
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  const out: DayTotals[] = [];
  for (let i = lo; i < days.length && days[i] <= to; i++) out.push(byDay.get(days[i])!);
  return out;
}

export function profitLoss(data: FinanceData, from: string, to: string): Pnl {
  const cats = catBy(data);
  const lines = new Map<string, PnlLine>();
  const add = (cat: FinCategory, amount: number, auto: boolean) => {
    const line = lines.get(cat.id) ?? { categoryId: cat.id, name: cat.name, amount: 0, group: cat.reportGroup, auto: false, systemKey: cat.systemKey };
    line.amount += amount;
    line.auto ||= auto;
    lines.set(cat.id, line);
  };
  for (const day of daysIn(data, from, to)) for (const [id, c] of day) add(cats.get(id)!, c.amount, c.auto);
  // Penyusutan per akhir bulan dalam rentang.
  const dep = systemCategory(data, "depreciation");
  if (dep && data.settings.autoDepreciation) {
    const earliest = data.balanceItems.reduce((m, i) => (i.key === "equipment" && monthOf(i.effectiveDate) < m ? monthOf(i.effectiveDate) : m), "9999-12");
    for (let ym = monthOf(from) > earliest ? monthOf(from) : earliest; ym <= monthOf(to); ym = addMonths(ym, 1)) {
      if (lastDay(ym) > to || lastDay(ym) < from) continue;
      const v = depreciationForMonth(data.balanceItems, ym);
      if (v) add(dep, v, true);
    }
  }
  const all = [...lines.values()].filter((l) => l.amount !== 0);
  const sum = (g: ReportGroup) => all.filter((l) => l.group === g).reduce((s, l) => s + l.amount, 0);
  const byAmount = (a: PnlLine, b: PnlLine) => b.amount - a.amount;
  const totalRevenue = sum("revenue");
  const totalCogs = sum("cogs");
  const totalOpex = sum("opex");
  const grossProfit = totalRevenue - totalCogs;
  const profitBeforeTax = grossProfit - totalOpex;
  const tax = taxFor(data, totalRevenue);
  const netProfit = profitBeforeTax - tax;
  return {
    revenue: all.filter((l) => l.group === "revenue").sort(byAmount),
    cogs: all.filter((l) => l.group === "cogs").sort(byAmount),
    opex: all.filter((l) => l.group === "opex").sort(byAmount),
    totalRevenue,
    totalCogs,
    grossProfit,
    totalOpex,
    profitBeforeTax,
    tax,
    netProfit,
    grossMargin: totalRevenue ? (grossProfit / totalRevenue) * 100 : null,
    netMargin: totalRevenue ? (netProfit / totalRevenue) * 100 : null,
    totalExpense: totalCogs + totalOpex + tax,
  };
}

/** PPh final = tarif × pendapatan periode (hanya bila pajak aktif — K-4). */
function taxFor(data: FinanceData, revenue: number): number {
  const { taxEnabled, taxRate } = data.settings;
  if (!taxEnabled || !taxRate) return 0;
  return Math.round((revenue * taxRate) / 100);
}

// ── Saldo akun ───────────────────────────────────────────────────────────────
/** Saldo tiap akun per tanggal (uang bergerak ≤ asOf). */
export function accountBalances(data: FinanceData, asOf: string): Map<string, number> {
  const bal = new Map(data.accounts.map((a) => [a.id, a.openingDate <= asOf ? a.openingBalance : 0]));
  const addTo = (id: string | null, v: number) => id && bal.set(id, (bal.get(id) ?? 0) + v);
  for (const t of posted(data)) {
    if (t.date > asOf) continue;
    switch (t.type) {
      case "income":
      case "owner_contribution":
        addTo(t.accountId, t.amount);
        break;
      case "expense":
      case "owner_withdrawal":
        addTo(t.accountId, -t.amount);
        break;
      case "transfer":
        addTo(t.accountId, -t.amount);
        addTo(t.toAccountId, t.amount);
        break;
    }
  }
  return bal;
}

// ── Neraca ───────────────────────────────────────────────────────────────────
export type BsLine = { label: string; note: string; amount: number; auto: boolean };
export type BalanceSheet = {
  asOf: string;
  currentAssets: BsLine[];
  fixedAssets: BsLine[];
  liabilities: BsLine[];
  equity: BsLine[];
  totalCurrentAssets: number;
  totalFixedAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  difference: number;
  cashTotal: number;
  /** Ketahanan kas (bulan) = kas & bank ÷ total biaya bulan terakhir. */
  runwayMonths: number | null;
};

const sumItems = (items: BalanceItem[], key: BalanceItem["key"], asOf: string) =>
  items.filter((i) => i.key === key && i.effectiveDate <= asOf).reduce((s, i) => s + i.amount, 0);

export function balanceSheet(data: FinanceData, asOf: string): BalanceSheet {
  const balances = accountBalances(data, asOf);
  const items = data.balanceItems;
  const accountLine = (a: FinAccount): BsLine => ({ label: a.name, note: a.note ?? "", amount: balances.get(a.id) ?? 0, auto: true });
  const cashAccounts = data.accounts.filter((a) => a.isActive || (balances.get(a.id) ?? 0) !== 0);

  const receivable = sumItems(items, "receivable", asOf);
  const otherAsset = sumItems(items, "other_asset", asOf);
  const currentAssets: BsLine[] = [
    ...cashAccounts.map(accountLine),
    ...(receivable ? [{ label: "Piutang sponsor", note: "Pos manual", amount: receivable, auto: false }] : []),
    ...(otherAsset ? [{ label: "Aset lain", note: "Pos manual", amount: otherAsset, auto: false }] : []),
  ];
  const equipment = sumItems(items, "equipment", asOf);
  const accDep = accumulatedDepreciation(data, asOf);
  const perMonth = items.reduce((s, i) => s + monthlyDepreciation(i), 0);
  const fixedAssets: BsLine[] = equipment
    ? [
        { label: "Peralatan", note: items.filter((i) => i.key === "equipment").map((i) => i.label).join(", "), amount: equipment, auto: false },
        { label: "Akumulasi penyusutan", note: `${perMonth.toLocaleString("id-ID")} / bulan`, amount: -accDep, auto: true },
      ]
    : [];

  const year = asOf.slice(0, 4);
  const priorYears = profitLoss(data, "0000-01-01", `${Number(year) - 1}-12-31`);
  const currentYearPnl = profitLoss(data, `${year}-01-01`, asOf);

  // Utang pajak = PPh terutang s.d. tanggal neraca (sama dengan yang sudah mengurangi laba di ekuitas)
  // − setoran (transaksi kategori PPh).
  let taxPayable = 0;
  if (data.settings.taxEnabled) {
    const taxCat = systemCategory(data, "tax");
    const paid = posted(data).filter((t) => t.categoryId === taxCat?.id && t.date <= asOf).reduce((s, t) => s + t.amount, 0);
    taxPayable = priorYears.tax + currentYearPnl.tax - paid;
  }
  const payable = sumItems(items, "payable", asOf);
  const otherLiability = sumItems(items, "other_liability", asOf);
  const liabilities: BsLine[] = [
    { label: "Utang usaha (vendor)", note: "Pos manual", amount: payable, auto: false },
    ...(otherLiability ? [{ label: "Kewajiban lain", note: "Pos manual", amount: otherLiability, auto: false }] : []),
    ...(data.settings.taxEnabled ? [{ label: "Utang pajak", note: "PPh final belum disetor", amount: taxPayable, auto: true }] : []),
  ];

  const contributions = posted(data).filter((t) => t.type === "owner_contribution" && t.date <= asOf).reduce((s, t) => s + t.amount, 0);
  const withdrawals = posted(data).filter((t) => t.type === "owner_withdrawal" && t.date <= asOf).reduce((s, t) => s + t.amount, 0);
  const capitalItems = sumItems(items, "capital", asOf);
  const retainedOpening = sumItems(items, "retained_earnings_opening", asOf);
  const retained = retainedOpening + priorYears.netProfit;
  const currentYear = currentYearPnl.netProfit;
  const equity: BsLine[] = [
    { label: "Modal disetor", note: "Setoran awal + transaksi setor modal", amount: capitalItems + contributions, auto: contributions !== 0 },
    { label: "Laba ditahan", note: `Akumulasi laba s.d. 31 Des ${Number(year) - 1}`, amount: retained, auto: true },
    { label: "Laba tahun berjalan", note: `Laba bersih 1 Jan – ${asOf.slice(8)}/${asOf.slice(5, 7)}/${year}`, amount: currentYear, auto: true },
    { label: "Prive / penarikan pemilik", note: `Σ penarikan pemilik`, amount: -withdrawals, auto: true },
  ];

  const total = (l: BsLine[]) => l.reduce((s, x) => s + x.amount, 0);
  const totalCurrentAssets = total(currentAssets);
  const totalFixedAssets = total(fixedAssets);
  const totalAssets = totalCurrentAssets + totalFixedAssets;
  const totalLiabilities = total(liabilities);
  const totalEquity = total(equity);
  const cashTotal = cashAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const lastMonth = monthOf(asOf);
  const cost = profitLoss(data, firstDay(lastMonth), lastDay(lastMonth)).totalExpense;
  return {
    asOf,
    currentAssets,
    fixedAssets,
    liabilities,
    equity,
    totalCurrentAssets,
    totalFixedAssets,
    totalAssets,
    totalLiabilities,
    totalEquity,
    difference: totalAssets - (totalLiabilities + totalEquity),
    cashTotal,
    runwayMonths: cost > 0 ? cashTotal / cost : null,
  };
}

// ── Tahunan ──────────────────────────────────────────────────────────────────
export type YearMonth = { ym: string; revenue: number; cost: number; net: number; margin: number | null; prevNet: number | null; started: boolean };
export type Yearly = {
  year: number;
  months: YearMonth[];
  elapsed: number;
  totals: { revenue: number; cost: number; net: number; margin: number | null; prevRevenue: number; prevNet: number };
  best: YearMonth | null;
  target: { amount: number; reached: number | null; remaining: number } | null;
  projection: number;
  topCosts: { name: string; amount: number; share: number }[];
};

export function yearly(data: FinanceData, year: number): Yearly {
  const nowYm = monthOf(data.today);
  // Bulan berjalan baru dihitung "berjalan" setelah ada transaksi (awal bulan tidak menarik garis laba ke 0).
  const currentHasData = posted(data).some((t) => monthOf(t.recognizedOn) === nowYm);
  const months: YearMonth[] = [];
  let prevRevenue = 0;
  let prevNet = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    const started = ym < nowYm || (ym === nowYm && currentHasData);
    const p = profitLoss(data, firstDay(ym), lastDay(ym));
    const prevYm = `${year - 1}-${String(m).padStart(2, "0")}`;
    const prev = profitLoss(data, firstDay(prevYm), lastDay(prevYm));
    if (started) {
      prevRevenue += prev.totalRevenue;
      prevNet += prev.netProfit;
    }
    months.push({ ym, revenue: p.totalRevenue, cost: p.totalExpense, net: p.netProfit, margin: p.netMargin, prevNet: prev.totalRevenue || prev.totalExpense ? prev.netProfit : null, started });
  }
  const done = months.filter((m) => m.started);
  const revenue = done.reduce((s, m) => s + m.revenue, 0);
  const cost = done.reduce((s, m) => s + m.cost, 0);
  const net = revenue - cost;
  const last3 = done.slice(-3);
  const avg = last3.length ? last3.reduce((s, m) => s + m.net, 0) / last3.length : 0;
  const projection = Math.round(net + avg * (12 - done.length));
  const t = data.targets.find((x) => x.year === year);
  const ytdPnl = profitLoss(data, `${year}-01-01`, `${year}-12-31`);
  const costLines = [...ytdPnl.cogs, ...ytdPnl.opex].sort((a, b) => b.amount - a.amount).slice(0, 3);
  return {
    year,
    months,
    elapsed: done.length,
    totals: { revenue, cost, net, margin: revenue ? (net / revenue) * 100 : null, prevRevenue, prevNet },
    best: done.length ? done.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    target: t ? { amount: t.netProfitTarget, reached: t.netProfitTarget ? (net / t.netProfitTarget) * 100 : null, remaining: Math.max(t.netProfitTarget - net, 0) } : null,
    projection,
    topCosts: costLines.map((l) => ({ name: l.name, amount: l.amount, share: cost ? (l.amount / cost) * 100 : 0 })),
  };
}

// ── Per sesi & event (§6.3b) ─────────────────────────────────────────────────
export type EventKind = "mabar" | "coaching" | "event" | "trip";
export const eventKind = (typeSlug: string): EventKind =>
  /coach/.test(typeSlug) ? "coaching" : /escape|trip|match|tournament|event/.test(typeSlug) ? "event" : "mabar";

export type EventRow = {
  key: string;
  kind: EventKind;
  title: string;
  /** Venue (sesi) atau jumlah activity (trip). */
  place: string;
  /** Tanggal mulai, YYYY-MM-DD. */
  date: string;
  participants: number;
  href: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  channel: string;
  hasCost: boolean;
};

/** Pendapatan, biaya & jalur bayar dari sekumpulan transaksi terkait. */
function tally(data: FinanceData, txs: FinTx[]) {
  const kuyy = data.accounts.find((a) => a.systemKey === "kuyy")?.id;
  let revenue = 0;
  let cost = 0;
  const channels = new Set<string>();
  for (const t of txs) {
    if (t.type === "expense") cost += t.amount;
    if (t.type !== "income") continue;
    revenue += t.amount;
    channels.add(
      t.source === "kuyy_import" || t.accountId === kuyy || /kuy/i.test(t.description)
        ? "Kuyy"
        : t.source === "ticket"
          ? "sistem"
          : t.source === "trip_payment"
            ? "paket trip"
            : "bayar manual",
    );
  }
  return { revenue, cost, profit: revenue - cost, margin: revenue ? ((revenue - cost) / revenue) * 100 : null, channel: [...channels].join(" + ") || "—", hasCost: cost > 0 };
}

/** Transaksi terposting per trip: pembayaran paket (trip_id) + transaksi activity trip (sessions.trip_id). */
const postedByTrip = memo((data) => {
  const tripOfSession = new Map(data.sessions.filter((s) => s.tripId).map((s) => [s.id, s.tripId as string]));
  const map = new Map<string, FinTx[]>();
  for (const t of posted(data)) {
    const trip = t.tripId ?? (t.sessionId ? tripOfSession.get(t.sessionId) : undefined);
    if (!trip) continue;
    const list = map.get(trip);
    if (list) list.push(t);
    else map.set(trip, [t]);
  }
  return map;
});

/**
 * Baris Per event bulan `ym`. Activity bagian dari trip tidak tampil sendiri: transaksinya dijumlahkan
 * ke baris trip (bersama pembayaran paket trip), di bulan trip dimulai.
 */
export function eventRows(data: FinanceData, ym: string): EventRow[] {
  const bySession = postedBySession(data);
  const tripIds = new Set(data.trips.map((t) => t.id));
  const sessions: EventRow[] = data.sessions
    .filter((s) => monthOf(s.startsAt.slice(0, 10)) === ym && !(s.tripId && tripIds.has(s.tripId)))
    .map((s) => ({
      key: s.id,
      kind: eventKind(s.typeSlug),
      title: s.title,
      place: s.venueName,
      date: s.startsAt.slice(0, 10),
      participants: s.participants,
      href: `/admin/keuangan/event/${s.id}`,
      ...tally(data, bySession.get(s.id) ?? []),
    }));
  const trips: EventRow[] = data.trips
    .filter((t) => monthOf(t.startsOn) === ym)
    .map((t) => {
      const activities = data.sessions.filter((s) => s.tripId === t.id).length;
      return {
        key: `trip:${t.id}`,
        kind: "trip" as const,
        title: t.title,
        place: `${activities} activity`,
        date: t.startsOn,
        participants: t.packages,
        href: `/admin/keuangan/transaksi?m=all&trip=${t.id}&with=activities`,
        ...tally(data, postedByTrip(data).get(t.id) ?? []),
      };
    });
  return [...trips, ...sessions].filter((r) => r.revenue !== 0 || r.cost !== 0 || r.participants > 0);
}

/** Rekonsiliasi bulan: transaksi diakui bulan itu, terkait sesi vs tidak. */
export function eventReconciliation(data: FinanceData, ym: string) {
  const from = firstDay(ym);
  const to = lastDay(ym);
  const pnl = profitLoss(data, from, to);
  let linkedRevenue = 0;
  let linkedCost = 0;
  const cats = catBy(data);
  for (const t of posted(data)) {
    if ((!t.sessionId && !t.tripId) || !between(t.recognizedOn, from, to) || !t.categoryId) continue;
    if (cats.get(t.categoryId)?.reportGroup === "tax") continue;
    if (t.type === "income") linkedRevenue += t.amount;
    if (t.type === "expense") linkedCost += t.amount;
  }
  const linkedProfit = linkedRevenue - linkedCost;
  const unlinkedRevenue = pnl.totalRevenue - linkedRevenue;
  const unlinkedCost = pnl.totalExpense - linkedCost;
  return { linkedProfit, unlinkedRevenue, unlinkedCost, netProfit: pnl.netProfit };
}

// ── Ringkasan ────────────────────────────────────────────────────────────────
export function trend(data: FinanceData, endYm: string, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const ym = addMonths(endYm, i - months + 1);
    const p = profitLoss(data, firstDay(ym), lastDay(ym));
    return { ym, revenue: p.totalRevenue, expense: p.totalExpense, net: p.netProfit };
  });
}

/** Tanggal saldo untuk bulan: akhir bulan, atau hari ini bila bulan berjalan. */
export const asOfFor = (data: FinanceData, ym: string) => (lastDay(ym) > data.today ? data.today : lastDay(ym));

// ── Daftar transaksi: gabung tiket otomatis per sesi (§3.2) ───────────────────

export type TxRow = { key: string; tx: FinTx; items: FinTx[]; amount: number };

/** Tiket otomatis dengan sesi, sumber, akun & bulan sama digabung jadi satu baris. */
export function groupTransactions(txs: FinTx[]): TxRow[] {
  const rows: TxRow[] = [];
  const groups = new Map<string, TxRow>();
  for (const t of txs) {
    if (SOURCE_META[t.source].ticket && t.sessionId) {
      const key = `grp:${t.source}:${t.sessionId}:${t.accountId}:${monthOf(t.recognizedOn)}`;
      const g = groups.get(key);
      if (g) {
        g.items.push(t);
        g.amount += t.amount;
        if (t.recognizedOn > g.tx.recognizedOn) g.tx = t;
        continue;
      }
      const row = { key, tx: t, items: [t], amount: t.amount };
      groups.set(key, row);
      rows.push(row);
    } else {
      rows.push({ key: t.id, tx: t, items: [t], amount: t.amount });
    }
  }
  return rows;
}

/** Nilai bertanda arus kas untuk tampilan (+ masuk, − keluar, transfer = netral positif). */
export function signedAmount(t: Pick<FinTx, "type" | "amount">): number {
  return t.type === "expense" || t.type === "owner_withdrawal" ? -t.amount : t.amount;
}
