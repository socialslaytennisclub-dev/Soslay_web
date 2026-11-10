import "server-only";
import { addMonths, lastDay } from "@/lib/finance/reports";
import { PAYMENT_KIND_LABEL } from "@/lib/trips";
import { demoTrip, demoTripBookings } from "./trip-demo";
import type { BalanceItem, FinAccount, FinCategory, FinSession, FinTx, FinanceData, TxSource, TxType } from "@/lib/finance/types";

/**
 * Data contoh Keuangan untuk mode demo (tanpa Supabase): Sep 2025 – Okt 2026, deterministik.
 * Pos neraca awal disusun seimbang (kas awal = modal + utang − peralatan − piutang), jadi Neraca
 * demo selalu "Seimbang".
 */

export const FINANCE_DEMO_TODAY = "2026-11-04";

const acc = (id: string, name: string, type: FinAccount["type"], systemKey: string, note: string, opening: number, isSystem = false, masked: string | null = null): FinAccount => ({
  id,
  name,
  type,
  systemKey,
  accountNoMasked: masked,
  note,
  isSystem,
  isActive: true,
  openingBalance: opening,
  openingDate: "2025-09-01",
});

const ACCOUNTS: FinAccount[] = [
  acc("acc-bca", "Bank BCA", "bank", "bank_main", "Akun utama", 45_000_000, false, "•••• 4821"),
  acc("acc-pg", "Payment gateway", "payment_gateway", "payment_gateway", "Penampung tiket & order shop", 2_000_000, true),
  acc("acc-kas", "Kas tunai", "cash", "cash", "Dipegang host / admin", 4_600_000),
  acc("acc-kuyy", "Saldo Kuyy", "platform", "kuyy", "Tiket Kuyy yang belum di-withdraw", 0, true),
];

type CatSeed = [id: string, name: string, kind: "income" | "expense", group: FinCategory["reportGroup"], journal: string, systemKey: string | null, isSystem: boolean, note: string | null, keywords: string[]];
const CATS: CatSeed[] = [
  ["cat-ticket", "Tiket activity", "income", "revenue", "Pendapatan Usaha", "ticket", false, "Otomatis dari Activities; manual untuk DP / cicilan", ["withdraw", "kuyy", "kuy", "rally", "rpd", "pax", "bayar manual"]],
  ["cat-merch", "Penjualan merchandise", "income", "revenue", "Pendapatan Usaha", "merch_sales", false, "Otomatis saat transfer order shop diverifikasi", ["tshirt", "figure"]],
  ["cat-sponsor", "Sponsorship", "income", "revenue", "Pendapatan Usaha", null, false, null, []],
  ["cat-coaching", "Coaching privat", "income", "revenue", "Pendapatan Usaha", null, false, null, []],
  ["cat-court", "Sewa lapangan", "expense", "opex", "Biaya Produksi", null, false, "Dicatat di tanggal bayar", ["book", "lapangan", "court"]],
  ["cat-honor", "Honor photographer, coach & host", "expense", "opex", "Gaji", null, false, "Honor freelance per sesi", ["photographer", "fotografer", "videographer", "editing", "pg ", "coach", "host"]],
  ["cat-payroll", "Gaji staf", "expense", "opex", "Gaji", null, false, "Payroll bulanan staf", ["payroll", "gaji"]],
  ["cat-marketing", "Marketing & iklan", "expense", "opex", "Biaya Produksi", null, false, null, []],
  ["cat-balls", "Bola & perlengkapan", "expense", "opex", "Biaya Produksi", null, false, null, ["bola", "ball"]],
  ["cat-food", "Konsumsi & hadiah", "expense", "opex", "Biaya Produksi", null, false, null, ["makan", "konsumsi", "pengeluaran team"]],
  ["cat-software", "Software & langganan", "expense", "opex", "Biaya Produksi", null, false, null, ["utilities", "adobe", "drive", "subscription"]],
  ["cat-transport", "Transportasi", "expense", "opex", "Biaya Produksi", null, false, "Sewa mobil, bensin", ["bensin", "sewa mobil", "sewa mobile", "tol", "parkir"]],
  ["cat-merchprod", "Produksi merchandise", "expense", "cogs", "Biaya Produksi", null, false, "Cetak kaos, sample, packaging · masuk baris HPP", ["tshirt", "t-shirt", "cetak", "sample", "packaging", "stempel", "paper bag", "goodiebag", "plastik bag", "custom character"]],
  ["cat-pgfee", "Biaya payment gateway", "expense", "opex", "Biaya Produksi", "pg_fee", false, "Dari potongan pencairan PG", []],
  ["cat-kuyyfee", "Biaya platform Kuyy", "expense", "opex", "Biaya Produksi", "kuyy_fee", false, "Selisih tiket Kuyy vs jumlah withdraw", []],
  ["cat-dep", "Penyusutan peralatan", "expense", "opex", "Biaya Produksi", "depreciation", true, "Dicatat otomatis tiap akhir bulan", []],
  ["cat-tax", "PPh final UMKM", "expense", "tax", "Biaya Produksi", "tax", true, "Otomatis dari omzet (bila pajak aktif)", []],
];

const BALANCE_ITEMS: BalanceItem[] = [
  { id: "bi-capital", key: "capital", label: "Modal disetor", amount: 100_000_000, effectiveDate: "2025-09-01", salvage: 0, lifeMonths: 0, note: "Setoran awal pemilik" },
  { id: "bi-equip", key: "equipment", label: "Ball machine, net cadangan, raket demo", amount: 48_000_000, effectiveDate: "2025-09-01", salvage: 3_000_000, lifeMonths: 36, note: null },
  { id: "bi-payable", key: "payable", label: "Utang vendor", amount: 14_600_000, effectiveDate: "2025-09-01", salvage: 0, lifeMonths: 0, note: "3 tagihan belum dibayar" },
  { id: "bi-recv", key: "receivable", label: "Piutang sponsor", amount: 15_000_000, effectiveDate: "2025-09-01", salvage: 0, lifeMonths: 0, note: "Termin November · jatuh tempo 15 Nov" },
];

/** PRNG deterministik (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFinanceDemo(sessions: FinSession[]): FinanceData {
  const rand = rng(606);
  const round = (v: number, to = 1000) => Math.round(v / to) * to;
  const txs: FinTx[] = [];
  const counters = new Map<string, number>();
  const push = (t: { type: TxType; date: string; amount: number; categoryId?: string | null; accountId: string; toAccountId?: string | null; description: string; counterparty?: string | null; source?: TxSource; sessionId?: string | null; tripId?: string | null; term?: FinTx["term"]; proof?: boolean; note?: string | null; ownerName?: string | null }) => {
    const ym = t.date.slice(2, 4) + t.date.slice(5, 7);
    const n = (counters.get(ym) ?? 0) + 1;
    counters.set(ym, n);
    const id = `demo-${txs.length + 1}`;
    txs.push({
      id,
      code: `TRX-${ym}-${String(n).padStart(4, "0")}`,
      type: t.type,
      status: "posted",
      date: t.date,
      recognizedOn: t.date,
      amount: t.amount,
      categoryId: t.categoryId ?? null,
      accountId: t.accountId,
      toAccountId: t.toAccountId ?? null,
      description: t.description,
      counterparty: t.counterparty ?? null,
      ownerName: t.ownerName ?? null,
      note: t.note ?? null,
      term: t.term ?? null,
      sessionId: t.sessionId ?? null,
      tripId: t.tripId ?? null,
      source: t.source ?? "manual",
      sourceRef: null,
      parentId: null,
      importBatchId: null,
      proofName: t.proof === false ? null : t.source && t.source !== "manual" ? null : "nota.jpg",
      hasProof: t.proof !== false && (!t.source || t.source === "manual"),
      createdBy: !t.source || t.source === "manual" ? "demo" : null,
      createdByName: !t.source || t.source === "manual" ? "Rara Anindya" : null,
      createdAt: `${t.date}T09:00:00+07:00`,
    });
    return id;
  };
  const day = (ym: string, d: number) => `${ym}-${String(Math.min(d, Number(lastDay(ym).slice(8)))).padStart(2, "0")}`;

  for (let i = 0, ym = "2025-09"; ym <= "2026-10"; i++, ym = addMonths(ym, 1)) {
    const growth = 1 + i * 0.075;
    const monthSessions = sessions.filter((s) => s.startsAt.slice(0, 7) === ym);
    // Pendapatan tiket: per sesi (bila ada sesi demo di bulan ini) atau gabungan per minggu.
    if (monthSessions.length) {
      for (const s of monthSessions) {
        const n = Math.max(6, s.participants || 10 + Math.floor(rand() * 12));
        const viaKuyy = rand() > 0.35;
        push({ type: "income", date: s.startsAt.slice(0, 10), amount: n * 150_000, categoryId: "cat-ticket", accountId: viaKuyy ? "acc-kuyy" : "acc-bca", description: `${s.title}`, source: viaKuyy ? "kuyy_import" : "ticket_manual_paid", sessionId: s.id, note: `${n} tiket` });
        push({ type: "expense", date: s.startsAt.slice(0, 10), amount: round(n * 150_000 * (0.2 + rand() * 0.2), 1000), categoryId: "cat-court", accountId: "acc-bca", description: `Sewa lapangan — ${s.venueName}`, counterparty: s.venueName, sessionId: rand() > 0.15 ? s.id : null });
      }
    }
    for (let w = 0; w < 4; w++) {
      push({ type: "income", date: day(ym, 7 * w + 6), amount: round((14_000_000 + rand() * 6_000_000) * growth, 50_000), categoryId: "cat-ticket", accountId: "acc-bca", description: `Withdraw Kuyy · minggu ${w + 1}`, counterparty: "Kuyy" });
      push({ type: "expense", date: day(ym, 7 * w + 3), amount: round((5_500_000 + rand() * 2_000_000) * growth, 1000), categoryId: "cat-court", accountId: "acc-bca", description: `Sewa lapangan · minggu ${w + 1}`, counterparty: "Common Grounds" });
    }
    push({ type: "income", date: day(ym, 20), amount: round((7_000_000 + rand() * 4_000_000) * growth, 10_000), categoryId: "cat-merch", accountId: "acc-bca", description: "Penjualan shop (transfer diverifikasi)", source: "shop_order_verified" });
    if (i % 3 === 1) push({ type: "income", date: day(ym, 27), amount: 15_000_000, categoryId: "cat-sponsor", accountId: "acc-bca", description: "Sponsor apparel — termin", counterparty: "Brand apparel" });
    push({ type: "income", date: day(ym, 15), amount: round((3_000_000 + rand() * 4_000_000) * growth, 100_000), categoryId: "cat-coaching", accountId: "acc-kas", description: "Coaching privat", counterparty: "Coach Dimas" });

    push({ type: "expense", date: day(ym, 28), amount: round((12_000_000 + rand() * 6_000_000) * growth, 50_000), categoryId: "cat-honor", accountId: "acc-bca", description: "Honor host, coach & photographer", counterparty: "Freelancer", proof: rand() > 0.2 });
    push({ type: "expense", date: day(ym, 25), amount: 3_000_000, categoryId: "cat-payroll", accountId: "acc-bca", description: "Payroll staf", counterparty: "Staf" });
    push({ type: "expense", date: day(ym, 12), amount: round((5_000_000 + rand() * 5_000_000) * growth, 10_000), categoryId: "cat-marketing", accountId: "acc-bca", description: "Iklan Instagram — kampanye Mabar", counterparty: "Meta Ads" });
    push({ type: "expense", date: day(ym, 9), amount: round((2_500_000 + rand() * 3_000_000) * growth, 10_000), categoryId: "cat-balls", accountId: "acc-bca", description: "Bola tennis", counterparty: "Toko olahraga · Senayan", proof: rand() > 0.15 });
    push({ type: "expense", date: day(ym, 18), amount: round((1_200_000 + rand() * 1_500_000) * growth, 10_000), categoryId: "cat-food", accountId: "acc-kas", description: "Konsumsi & hadiah Mabar" });
    push({ type: "expense", date: day(ym, 2), amount: 1_950_000, categoryId: "cat-software", accountId: "acc-bca", description: "Utilities kantor (Adobe, Drive)" });
    push({ type: "expense", date: day(ym, 16), amount: round((4_000_000 + rand() * 8_000_000) * growth, 10_000), categoryId: "cat-merchprod", accountId: "acc-bca", description: "Cetak T-shirt & packaging", counterparty: "Konveksi" });
    if (rand() > 0.5) push({ type: "expense", date: day(ym, 22), amount: round(800_000 + rand() * 1_000_000, 500), categoryId: "cat-transport", accountId: "acc-bca", description: "Sewa mobil & bensin" });
    // Saldo Kuyy dicairkan ke bank (transfer) + fee Kuyy.
    const kuyyIn = txs.filter((t) => t.accountId === "acc-kuyy" && t.type === "income" && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
    if (kuyyIn) {
      const parent = push({ type: "transfer", date: day(ym, 30), amount: kuyyIn, accountId: "acc-kuyy", toAccountId: "acc-bca", description: "Withdraw Kuyy → Bank BCA", source: "manual" });
      const fee = round(kuyyIn * 0.04, 1000);
      const feeId = push({ type: "expense", date: day(ym, 30), amount: fee, categoryId: "cat-kuyyfee", accountId: "acc-bca", description: "Biaya platform Kuyy", source: "transfer_fee" });
      const f = txs.find((t) => t.id === feeId)!;
      f.parentId = parent;
    }
    // Kas tunai disetor ke bank tiap bulan.
    push({ type: "transfer", date: day(ym, 29), amount: 1_500_000, accountId: "acc-kas", toAccountId: "acc-bca", description: "Setor kas tunai → Bank BCA" });
    if (ym >= "2026-01" && i % 2 === 0) push({ type: "owner_withdrawal", date: day(ym, 30), amount: 20_000_000, accountId: "acc-bca", description: "Penarikan pemilik", ownerName: "Pemilik" });
  }

  // Pembayaran paket trip "Rally in Paradise · Bali" (A-10, Tennis Escape).
  for (const b of demoTripBookings) {
    for (const p of b.payments) {
      const label = PAYMENT_KIND_LABEL[p.kind];
      push({ type: "income", date: p.receivedOn, amount: p.amount, categoryId: "cat-ticket", accountId: "acc-bca", description: `${label} · ${b.name} · ${demoTrip.title}`, source: "trip_payment", tripId: demoTrip.id, term: p.kind, proof: false });
    }
  }

  return {
    accounts: ACCOUNTS,
    categories: CATS.map(([id, name, kind, reportGroup, journalAccount, systemKey, isSystem, note, keywords]) => ({ id, name, kind, reportGroup, journalAccount, systemKey, isSystem, isArchived: false, note, keywords })),
    transactions: txs.sort((a, b) => (a.date === b.date ? b.code.localeCompare(a.code) : b.date.localeCompare(a.date))),
    balanceItems: BALANCE_ITEMS,
    settings: {
      goLiveDate: "2026-12-01",
      taxEnabled: false,
      taxRate: 0.5,
      autoTicket: true,
      autoManualPaid: true,
      autoKuyy: true,
      autoShop: true,
      autoDepreciation: true,
      manualPaidAccountId: "acc-bca",
      defaultBankAccountId: "acc-bca",
    },
    targets: [{ year: 2026, netProfitTarget: 350_000_000, monthly: null }],
    sessions,
    trips: [{ id: demoTrip.id, title: demoTrip.title, startsOn: demoTrip.startsOn, endsOn: demoTrip.endsOn, packages: demoTripBookings.length }],
    batches: [],
    today: FINANCE_DEMO_TODAY,
  };
}
