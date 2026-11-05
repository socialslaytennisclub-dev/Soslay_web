import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { todayWib } from "@/lib/finance/format";
import type { BalanceItem, FinAccount, FinCategory, FinSession, FinSettings, FinTarget, FinTx, FinanceData, FinanceRole, ImportBatch } from "@/lib/finance/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset } from "./dataset";
import { activityTypeLabels } from "./demo-data";
import { buildFinanceDemo } from "./finance-demo";
import { getAdminSession, type AdminSession } from "./session";

/** Bucket privat bukti transaksi (nota / struk / transfer). */
export const FINANCE_PROOF_BUCKET = "finance-proofs";

/**
 * Akses modul Keuangan: "full" (izin finance = edit, Super Admin) atau "recorder" (finance = view,
 * Pencatat keuangan). null = tidak punya akses → halaman 12u. Mode demo = full.
 */
export function financeRole(session: AdminSession): FinanceRole | null {
  if (session.mode === "demo") return "full";
  if (session.mode === "denied") return null;
  const access = session.access.finance ?? "none";
  return access === "edit" ? "full" : access === "view" ? "recorder" : null;
}

export const getFinanceAccess = cache(async () => {
  const session = await getAdminSession();
  return { session, role: financeRole(session), userId: session.mode === "live" ? session.userId : "demo" };
});

/** Sesi Activities untuk "Kaitkan ke sesi" & laporan Per event. */
async function financeSessions(): Promise<FinSession[]> {
  const ds = await getDataset();
  return ds.sessions
    .filter((s) => s.status !== "draft")
    .map((s) => ({
      id: s.id,
      title: s.title,
      typeSlug: s.typeSlug,
      typeLabel: activityTypeLabels[s.typeSlug] ?? s.typeSlug,
      venueName: s.venueName,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      participants: ds.bookingsOfSession(s.id).filter((b) => b.status !== "cancelled" && b.status !== "waitlisted").length,
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

let demoData: FinanceData | undefined;

/**
 * Akun penerima pembayaran (aktif, bukan Saldo Kuyy) + akun default bayar manual — untuk form Catat
 * pembayaran trip. Hanya dua tabel kecil, bukan seluruh data Keuangan.
 */
export const getPaymentAccounts = cache(async (): Promise<{ accounts: { id: string; name: string }[]; defaultId: string }> => {
  const pick = (list: { id: string; name: string; type: string; isActive: boolean }[], manual: string | null) => {
    const accounts = list.filter((a) => a.isActive && a.type !== "platform").map((a) => ({ id: a.id, name: a.name }));
    return { accounts, defaultId: manual && accounts.some((a) => a.id === manual) ? manual : (accounts[0]?.id ?? "") };
  };
  if (!isSupabaseConfigured) {
    const demo = await getFinanceData();
    return pick(demo.accounts, demo.settings.manualPaidAccountId);
  }
  const supabase = await createSupabaseServerClient();
  const [accounts, settings] = await Promise.all([
    supabase.from("finance_accounts").select("id, name, type, is_active").order("sort_order").order("created_at"),
    supabase.from("finance_settings").select("manual_paid_account_id").maybeSingle(),
  ]);
  if (accounts.error) throw new Error(`Gagal memuat akun: ${accounts.error.message}`);
  return pick(
    (accounts.data ?? []).map((a) => ({ id: a.id as string, name: a.name as string, type: a.type as string, isActive: !!a.is_active })),
    (settings.data?.manual_paid_account_id as string | null) ?? null,
  );
});

export const getFinanceData = cache(async (): Promise<FinanceData> => {
  if (!isSupabaseConfigured) return (demoData ??= buildFinanceDemo(await financeSessions()));
  const supabase = await createSupabaseServerClient();
  const [accounts, categories, transactions, items, settings, targets, batches, sessions] = await Promise.all([
    supabase.from("finance_accounts").select("*").order("sort_order").order("created_at"),
    supabase.from("finance_categories").select("*, finance_category_keywords(keyword)").order("sort_order").order("name"),
    fetchTransactions(supabase),
    supabase.from("finance_balance_items").select("*").is("deleted_at", null).order("effective_date"),
    supabase.from("finance_settings").select("*").maybeSingle(),
    supabase.from("finance_targets").select("*"),
    supabase.from("finance_import_batches").select("id, file_name, tx_total, imported_at, undo_until, status").order("imported_at", { ascending: false }).limit(20),
    financeSessions(),
  ]);
  for (const r of [accounts, categories, items, settings, targets]) if (r.error) throw new Error(`Gagal memuat keuangan: ${r.error.message}`);
  const s = settings.data;
  return {
    accounts: (accounts.data ?? []).map(mapAccount),
    categories: (categories.data ?? []).map(mapCategory),
    transactions,
    balanceItems: (items.data ?? []).map(mapItem),
    settings: {
      goLiveDate: s?.go_live_date ?? "2026-12-01",
      taxEnabled: !!s?.tax_enabled,
      taxRate: s?.tax_rate === null || s?.tax_rate === undefined ? null : Number(s.tax_rate),
      autoTicket: s?.auto_ticket ?? true,
      autoManualPaid: s?.auto_manual_paid ?? true,
      autoKuyy: s?.auto_kuyy ?? true,
      autoShop: s?.auto_shop ?? true,
      autoDepreciation: s?.auto_depreciation ?? true,
      manualPaidAccountId: s?.manual_paid_account_id ?? null,
      defaultBankAccountId: s?.default_bank_account_id ?? null,
    } satisfies FinSettings,
    targets: (targets.data ?? []).map((t): FinTarget => ({ year: t.year, netProfitTarget: Number(t.net_profit_target), monthly: t.monthly ?? null })),
    sessions,
    batches: (batches.data ?? []).map((b): ImportBatch => ({ id: b.id, fileName: b.file_name, txTotal: b.tx_total, importedAt: b.imported_at, undoUntil: b.undo_until, status: b.status })),
    today: todayWib(),
  };
});

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const mapAccount = (a: Row): FinAccount => ({
  id: String(a.id),
  name: String(a.name),
  type: a.type as FinAccount["type"],
  systemKey: str(a.system_key),
  accountNoMasked: str(a.account_no_masked),
  note: str(a.note),
  isSystem: !!a.is_system,
  isActive: !!a.is_active,
  openingBalance: Number(a.opening_balance),
  openingDate: String(a.opening_date),
});

const mapCategory = (c: Row): FinCategory => ({
  id: String(c.id),
  name: String(c.name),
  kind: c.kind as FinCategory["kind"],
  reportGroup: c.report_group as FinCategory["reportGroup"],
  journalAccount: String(c.journal_account),
  systemKey: str(c.system_key),
  isSystem: !!c.is_system,
  isArchived: !!c.is_archived,
  note: str(c.note),
  keywords: ((c.finance_category_keywords as { keyword: string }[] | null) ?? []).map((k) => k.keyword),
});

const mapItem = (i: Row): BalanceItem => {
  const meta = (i.meta ?? {}) as { salvage?: number; life_months?: number };
  return {
    id: String(i.id),
    key: i.key as BalanceItem["key"],
    label: String(i.label),
    amount: Number(i.amount),
    effectiveDate: String(i.effective_date),
    salvage: Number(meta.salvage ?? 0),
    lifeMonths: Number(meta.life_months ?? 0),
    note: str(i.note),
  };
};

/** Semua transaksi aktif (PostgREST maks 1.000 baris per request → per halaman). */
async function fetchTransactions(supabase: SupabaseClient): Promise<FinTx[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("finance_transactions")
      .select("*")
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("code", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Gagal memuat transaksi: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const names = await staffNames(rows.map((r) => str(r.created_by)).filter((v): v is string => !!v));
  return rows.map((t) => ({
    id: String(t.id),
    code: String(t.code),
    type: t.type as FinTx["type"],
    status: t.status as FinTx["status"],
    date: String(t.date),
    recognizedOn: String(t.recognized_on),
    amount: Number(t.amount),
    categoryId: str(t.category_id),
    accountId: String(t.account_id),
    toAccountId: str(t.to_account_id),
    description: String(t.description),
    counterparty: str(t.counterparty),
    ownerName: str(t.owner_name),
    note: str(t.note),
    term: (t.term as FinTx["term"]) ?? null,
    sessionId: str(t.activity_session_id),
    tripId: str(t.trip_id),
    source: t.source as FinTx["source"],
    sourceRef: str(t.source_ref),
    parentId: str(t.parent_id),
    importBatchId: str(t.import_batch_id),
    proofName: str(t.proof_name),
    hasProof: !!t.proof_path,
    createdBy: str(t.created_by),
    createdByName: t.created_by ? (names.get(String(t.created_by)) ?? null) : null,
    createdAt: String(t.created_at),
  }));
}

/** Nama pencatat (staff_members hanya terbaca role Settings → pakai service role bila ada). */
async function staffNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());
  const { data } = await client.from("staff_members").select("user_id, full_name").in("user_id", unique);
  return new Map((data ?? []).map((s) => [s.user_id as string, s.full_name as string]));
}

/** Riwayat perubahan satu transaksi (drawer detail). */
export async function transactionHistory(id: string): Promise<{ at: string; action: string; actor: string; before: Row | null; after: Row | null }[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("finance_audit_logs").select("at, action, actor_id, before, after").eq("entity", "transaction").eq("entity_id", id).order("at", { ascending: false }).limit(20);
  const names = await staffNames((data ?? []).map((d) => d.actor_id).filter(Boolean));
  return (data ?? []).map((d) => ({ at: d.at, action: d.action, actor: names.get(d.actor_id) ?? "—", before: d.before, after: d.after }));
}
