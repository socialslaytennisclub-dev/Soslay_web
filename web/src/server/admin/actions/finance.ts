"use server";

import { revalidatePath } from "next/cache";
import { accountBalances } from "@/lib/finance/reports";
import { canEditTx, SOURCE_META } from "@/lib/finance/sources";
import { selectableCategory } from "@/lib/finance/views";
import type { BalanceItemKey, FinanceRole, TxTerm, TxType } from "@/lib/finance/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadPrivateFile } from "@/server/storage";
import { getAdminSession } from "../session";
import { FINANCE_PROOF_BUCKET, financeRole, getFinanceData } from "../finance-repo";
import { readFirstSheet } from "../xlsx";
import { audit, done, fail, type ActionResult } from "./common";

/**
 * Server actions modul Keuangan (§4, §7, §9). Setiap aksi dicek di server (bukan hanya UI):
 * Super Admin = "full", Pencatat keuangan = "recorder" (hanya pemasukan/pengeluaran/transfer
 * miliknya sendiri). RLS finance_* di database menjadi penjaga terakhir.
 */

const PROOF_TYPES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_PROOF = 5 * 1024 * 1024;

type Auth = { userId: string; name: string; role: FinanceRole };
const DEMO_ERROR = "Mode demo: sambungkan Supabase untuk menyimpan.";

async function requireFinance(level: "record" | "full"): Promise<Auth | { error: string }> {
  const session = await getAdminSession();
  if (session.mode === "demo") return { error: DEMO_ERROR };
  if (session.mode === "denied") return { error: "Sesi admin berakhir — masuk lagi lewat /masuk/admin." };
  const role = financeRole(session);
  if (!role) return { error: "Kamu tidak punya akses Keuangan." };
  if (level === "full" && role !== "full") return { error: "Hanya Super Admin yang bisa melakukan ini." };
  return { userId: session.userId, name: session.name, role };
}

async function financeLog(actorId: string, entity: string, entityId: string | null, action: string, before: unknown, after: unknown) {
  const supabase = await createSupabaseServerClient();
  await Promise.all([
    supabase.from("finance_audit_logs").insert({ entity, entity_id: entityId, action, before: before ?? null, after: after ?? null, actor_id: actorId }),
    audit(actorId, `Keuangan · ${action}`, `finance_${entity}`, entityId ?? undefined),
  ]);
}

function refresh() {
  revalidatePath("/admin/keuangan", "layout");
}

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const toInt = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
};
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

// ── Transaksi manual ─────────────────────────────────────────────────────────
export type TxFieldErrors = Partial<Record<"date" | "amount" | "categoryId" | "accountId" | "toAccountId" | "description" | "fee" | "proof", string>>;
export type TxResult = { ok: true; message: string; id: string } | { ok: false; error: string; fields?: TxFieldErrors };

/**
 * Simpan transaksi dari form 12c / 12h / 12h-2 / 12i (FormData supaya bukti ikut terunggah).
 * Field: id?, type, date, amount, categoryId, accountId, toAccountId, fee, description,
 * counterparty, ownerName, note, sessionId, term, proof (File), removeProof.
 */
export async function saveTransaction(formData: FormData): Promise<TxResult> {
  const type = text(formData.get("type")) as TxType;
  const auth = await requireFinance(type === "owner_withdrawal" || type === "owner_contribution" ? "full" : "record");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!["income", "expense", "transfer", "owner_withdrawal", "owner_contribution"].includes(type)) return { ok: false, error: "Jenis transaksi tidak valid." };

  const id = text(formData.get("id")) || null;
  const date = text(formData.get("date"));
  const amount = toInt(formData.get("amount"));
  const fee = toInt(formData.get("fee") || 0);
  const categoryId = text(formData.get("categoryId")) || null;
  const accountId = text(formData.get("accountId"));
  const toAccountId = text(formData.get("toAccountId")) || null;
  const counterparty = text(formData.get("counterparty")) || null;
  const ownerName = text(formData.get("ownerName")) || null;
  const note = text(formData.get("note")) || null;
  const sessionId = text(formData.get("sessionId")) || null;
  const term = (text(formData.get("term")) || null) as TxTerm | null;
  const proof = formData.get("proof");
  const removeProof = formData.get("removeProof") === "1";

  const data = await getFinanceData();
  const existingTx = id ? data.transactions.find((t) => t.id === id) : undefined;
  const category = data.categories.find((c) => c.id === categoryId);
  const fields: TxFieldErrors = {};
  if (!ymd.test(date)) fields.date = "Isi tanggal transaksi.";
  else if (date > data.today) fields.date = "Tanggal tidak boleh di masa depan.";
  if (!Number.isInteger(amount) || amount <= 0) fields.amount = "Jumlah harus angka Rupiah lebih dari 0.";
  if (type === "income" || type === "expense") {
    if (!category) fields.categoryId = "Pilih kategori.";
    else if (category.kind !== type || !selectableCategory(data, category, existingTx?.categoryId)) fields.categoryId = "Kategori ini tidak bisa dipilih.";
  }
  if (!data.accounts.some((a) => a.id === accountId && a.isActive)) fields.accountId = "Pilih akun.";
  if (type === "transfer") {
    if (!toAccountId || !data.accounts.some((a) => a.id === toAccountId && a.isActive)) fields.toAccountId = "Pilih akun tujuan.";
    else if (toAccountId === accountId) fields.toAccountId = "Akun tujuan harus berbeda dari akun asal.";
    if (!Number.isInteger(fee) || fee < 0) fields.fee = "Biaya transfer tidak valid.";
    else if (fee >= amount) fields.fee = "Biaya transfer harus lebih kecil dari jumlah.";
    if (!fields.amount && !fields.date && !fields.accountId) {
      const own = id ? data.transactions.find((t) => t.id === id) : null;
      const balance = (accountBalances(data, date).get(accountId) ?? 0) + (own && own.accountId === accountId && own.date <= date ? own.amount : 0);
      if (amount > balance) fields.amount = `Melebihi saldo akun asal pada tanggal itu (Rp${balance.toLocaleString("id-ID")}).`;
    }
  }
  if (sessionId && !data.sessions.some((s) => s.id === sessionId)) return { ok: false, error: "Sesi yang dikaitkan tidak ditemukan." };
  if (Object.keys(fields).length) return { ok: false, error: `${Object.keys(fields).length} isian perlu diperbaiki.`, fields };

  const existing = id ? data.transactions.find((t) => t.id === id) : null;
  if (id) {
    if (!existing) return { ok: false, error: "Transaksi tidak ditemukan." };
    if (!SOURCE_META[existing.source].editable) return { ok: false, error: "Transaksi otomatis tidak bisa diubah dari Keuangan — koreksi lewat modul asalnya." };
    if (!canEditTx(existing, auth.role, auth.userId)) return { ok: false, error: "Pencatat hanya bisa mengubah transaksi manual yang dicatat sendiri." };
  }

  let proofFields: Record<string, unknown> = {};
  if (proof instanceof File && proof.size > 0) {
    const up = await uploadPrivateFile({ bucket: FINANCE_PROOF_BUCKET, file: proof, folder: date.slice(0, 7), maxBytes: MAX_PROOF, types: PROOF_TYPES });
    if (!up.ok) return { ok: false, error: up.error, fields: { proof: up.error } };
    proofFields = { proof_path: up.path, proof_name: proof.name.slice(0, 120), proof_size: proof.size };
  } else if (removeProof) {
    proofFields = { proof_path: null, proof_name: null, proof_size: null };
  }

  const accountName = (aid: string | null) => data.accounts.find((a) => a.id === aid)?.name ?? "akun";
  const description =
    text(formData.get("description")) ||
    (type === "transfer"
      ? `Transfer ${accountName(accountId)} → ${accountName(toAccountId)}`
      : type === "owner_withdrawal"
        ? `Penarikan pemilik${ownerName ? ` · ${ownerName}` : ""}`
        : type === "owner_contribution"
          ? `Setor modal${ownerName ? ` · ${ownerName}` : ""}`
          : `${category?.name}${counterparty ? ` — ${counterparty}` : ""}`);

  const row = {
    type,
    date,
    recognized_on: date,
    amount,
    category_id: type === "income" || type === "expense" ? categoryId : null,
    account_id: accountId,
    to_account_id: type === "transfer" ? toAccountId : null,
    description: description.slice(0, 200),
    counterparty: type === "income" || type === "expense" ? counterparty : null,
    owner_name: type.startsWith("owner_") ? ownerName : null,
    note,
    term: type === "income" && category?.systemKey === "ticket" ? term : null,
    activity_session_id: type === "income" || type === "expense" ? sessionId : null,
    updated_by: auth.userId,
    ...proofFields,
  };

  const supabase = await createSupabaseServerClient();
  let txId = id;
  if (id) {
    const { error } = await supabase.from("finance_transactions").update(row).eq("id", id);
    if (error) return { ok: false, error: `Gagal menyimpan: ${error.message}` };
    await financeLog(auth.userId, "transaction", id, `ubah ${existing!.code}`, existing, row);
  } else {
    const { data: created, error } = await supabase.from("finance_transactions").insert({ ...row, source: "manual", created_by: auth.userId }).select("id, code").single();
    if (error || !created) return { ok: false, error: `Gagal menyimpan: ${error?.message}` };
    txId = created.id as string;
    await financeLog(auth.userId, "transaction", txId, `catat ${created.code}`, null, row);
  }

  // Biaya transfer → pengeluaran terpisah di akun tujuan (Biaya platform Kuyy / Biaya payment gateway).
  // Transfer diubah: biaya lama selalu diganti — juga bila diubah jadi jenis lain (tanpa biaya transfer).
  if (existing?.type === "transfer") await supabase.from("finance_transactions").update({ deleted_at: new Date().toISOString(), deleted_reason: replacedFeeReason(txId!) }).eq("parent_id", txId).is("deleted_at", null);
  if (type === "transfer") {
    if (fee > 0) {
      const fromKuyy = data.accounts.find((a) => a.id === accountId)?.systemKey === "kuyy";
      const feeCat = data.categories.find((c) => c.systemKey === (fromKuyy ? "kuyy_fee" : "pg_fee"));
      const { error } = await supabase.from("finance_transactions").insert({
        type: "expense",
        date,
        recognized_on: date,
        amount: fee,
        category_id: feeCat?.id,
        account_id: toAccountId,
        description: `${feeCat?.name ?? "Biaya transfer"} · ${description}`.slice(0, 200),
        source: "manual",
        parent_id: txId,
        created_by: auth.userId,
      });
      if (error) return { ok: false, error: `Transfer tersimpan, tapi biaya transfer gagal: ${error.message}` };
    }
  }

  refresh();
  const label = { income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer", owner_withdrawal: "Penarikan pemilik", owner_contribution: "Setor modal" }[type];
  return { ok: true, id: txId!, message: `${label} Rp${amount.toLocaleString("id-ID")} ${id ? "diperbarui" : "tersimpan"}.` };
}

/** Hapus (soft delete) transaksi manual — bisa dibatalkan lewat restoreTransaction. */
export async function deleteTransaction(id: string, reason?: string): Promise<ActionResult> {
  const auth = await requireFinance("record");
  if ("error" in auth) return fail(auth.error);
  const data = await getFinanceData();
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx) return fail("Transaksi tidak ditemukan.");
  if (!SOURCE_META[tx.source].editable) return fail("Transaksi otomatis tidak bisa dihapus dari Keuangan.");
  if (!canEditTx(tx, auth.role, auth.userId)) return fail("Pencatat hanya bisa menghapus transaksi manual yang dicatat sendiri.");
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("finance_transactions").update({ deleted_at: now, deleted_reason: reason?.slice(0, 200) || null, updated_by: auth.userId }).eq("id", id);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  // Biaya transfer ikut terhapus, ditandai supaya "Batalkan" memulihkan tepat baris ini saja.
  await supabase.from("finance_transactions").update({ deleted_at: now, deleted_reason: childDeletedReason(id), updated_by: auth.userId }).eq("parent_id", id).is("deleted_at", null);
  await financeLog(auth.userId, "transaction", id, `hapus ${tx.code}`, tx, { deleted_reason: reason ?? null });
  refresh();
  return done(`${tx.code} dihapus.`);
}

/** Penanda biaya transfer yang terhapus bersama transfer induknya (bukan yang diganti saat transfer diedit). */
const childDeletedReason = (parentId: string) => `ikut dihapus bersama ${parentId}`;
/** Penanda biaya transfer lama yang diganti saat transfer induknya diubah. Memuat id induk (bukan teks yang
 *  mungkin diketik user sebagai alasan hapus) — sama seperti childDeletedReason. */
const replacedFeeReason = (parentId: string) => `diganti saat transfer ${parentId} diubah`;

/** "Batalkan" pada toast (12k): pulihkan transaksi yang baru dihapus. */
export async function restoreTransaction(id: string): Promise<ActionResult> {
  const auth = await requireFinance("record");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase.from("finance_transactions").select("code, deleted_at, deleted_reason, created_by, parent_id, import_batches:finance_import_batches(status)").eq("id", id).maybeSingle();
  if (!tx?.deleted_at) return fail("Transaksi tidak ditemukan.");
  // Yang dihapus sistem tidak dipulihkan satu per satu: biaya transfer yang ikut / diganti bersama induknya
  // (dipulihkan lewat induknya) dan transaksi dari import yang sudah dibatalkan.
  const batch = tx.import_batches as unknown as { status: string } | null;
  const parentId = tx.parent_id as string | null;
  const systemDeleted = batch?.status === "undone" || (parentId !== null && [childDeletedReason(parentId), replacedFeeReason(parentId)].includes(tx.deleted_reason as string));
  if (systemDeleted) return fail(`${tx.code} tidak bisa dipulihkan.`);
  if (auth.role === "recorder" && tx.created_by !== auth.userId) return fail("Tidak bisa memulihkan transaksi milik orang lain.");
  const { error } = await supabase.from("finance_transactions").update({ deleted_at: null, deleted_reason: null }).eq("id", id);
  if (error) return fail(`Gagal memulihkan: ${error.message}`);
  const { error: childError } = await supabase.from("finance_transactions").update({ deleted_at: null, deleted_reason: null }).eq("parent_id", id).eq("deleted_reason", childDeletedReason(id));
  if (childError) return fail(`${tx.code} dipulihkan, tapi biaya transfernya gagal: ${childError.message}`);
  await financeLog(auth.userId, "transaction", id, `batalkan hapus ${tx.code}`, null, null);
  refresh();
  return done(`${tx.code} dipulihkan.`);
}

/** Kaitkan / lepas transaksi ke sesi (Per event · "Kaitkan transaksi"). */
export async function linkTransaction(id: string, sessionId: string | null): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase.from("finance_transactions").select("code, type, activity_session_id").eq("id", id).maybeSingle();
  if (!tx) return fail("Transaksi tidak ditemukan.");
  if (tx.type !== "income" && tx.type !== "expense") return fail("Hanya pemasukan / pengeluaran yang bisa dikaitkan ke sesi.");
  const { error } = await supabase.from("finance_transactions").update({ activity_session_id: sessionId, updated_by: auth.userId }).eq("id", id);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  await financeLog(auth.userId, "transaction", id, `${sessionId ? "kaitkan" : "lepas"} sesi ${tx.code}`, { activity_session_id: tx.activity_session_id }, { activity_session_id: sessionId });
  refresh();
  return done(sessionId ? `${tx.code} dikaitkan ke sesi.` : `${tx.code} dilepas dari sesi.`);
}

// ── Akun ─────────────────────────────────────────────────────────────────────
export async function saveAccount(input: { id?: string; name: string; type: string; accountNoMasked?: string; note?: string; isActive?: boolean }): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const name = input.name.trim();
  if (!name) return fail("Isi nama akun.");
  if (!["bank", "payment_gateway", "cash", "platform"].includes(input.type)) return fail("Jenis akun tidak valid.");
  const supabase = await createSupabaseServerClient();
  const row = { name, type: input.type, account_no_masked: input.accountNoMasked?.trim() || null, note: input.note?.trim() || null, is_active: input.isActive ?? true };
  if (input.id) {
    const { data: before } = await supabase.from("finance_accounts").select("*").eq("id", input.id).maybeSingle();
    if (!before) return fail("Akun tidak ditemukan.");
    if (before.is_system && row.is_active === false) return fail("Akun sistem tidak bisa dinonaktifkan.");
    const { error } = await supabase.from("finance_accounts").update(row).eq("id", input.id);
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
    await financeLog(auth.userId, "account", input.id, `ubah akun ${name}`, before, row);
  } else {
    const { data, error } = await supabase.from("finance_accounts").insert({ ...row, sort_order: 50 }).select("id").single();
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
    await financeLog(auth.userId, "account", data.id, `tambah akun ${name}`, null, row);
  }
  refresh();
  return done(`Akun ${name} tersimpan.`);
}

/** Hapus akun: hanya bila belum punya transaksi; selain itu dinonaktifkan. */
export async function deleteAccount(id: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: acc } = await supabase.from("finance_accounts").select("name, is_system").eq("id", id).maybeSingle();
  if (!acc) return fail("Akun tidak ditemukan.");
  if (acc.is_system) return fail("Akun sistem tidak bisa dihapus.");
  const { count } = await supabase.from("finance_transactions").select("id", { count: "exact", head: true }).or(`account_id.eq.${id},to_account_id.eq.${id}`);
  if (count) {
    await supabase.from("finance_accounts").update({ is_active: false }).eq("id", id);
    await financeLog(auth.userId, "account", id, `nonaktifkan akun ${acc.name}`, null, { is_active: false });
    refresh();
    return done(`${acc.name} sudah punya transaksi — akun dinonaktifkan.`);
  }
  const { error } = await supabase.from("finance_accounts").delete().eq("id", id);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  await financeLog(auth.userId, "account", id, `hapus akun ${acc.name}`, acc, null);
  refresh();
  return done(`Akun ${acc.name} dihapus.`);
}

// ── Kategori ─────────────────────────────────────────────────────────────────
export async function saveCategory(input: {
  id?: string;
  name: string;
  kind: "income" | "expense";
  reportGroup: "revenue" | "cogs" | "opex";
  note?: string;
  journalAccount?: string;
  keywords?: string[];
}): Promise<ActionResult & { id?: string }> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const name = input.name.trim();
  if (!name) return fail("Isi nama kategori.");
  if (input.kind === "income" && input.reportGroup !== "revenue") return fail("Kategori pemasukan masuk pos Pendapatan.");
  if (input.kind === "expense" && input.reportGroup === "revenue") return fail("Kategori pengeluaran masuk pos Beban operasional atau HPP.");
  const supabase = await createSupabaseServerClient();
  const row = {
    name,
    kind: input.kind,
    report_group: input.reportGroup,
    note: input.note?.trim() || null,
    journal_account: input.journalAccount?.trim() || (input.kind === "income" ? "Pendapatan Usaha" : "Biaya Produksi"),
  };
  let id = input.id;
  if (id) {
    const { data: before } = await supabase.from("finance_categories").select("*").eq("id", id).maybeSingle();
    if (!before) return fail("Kategori tidak ditemukan.");
    if (before.is_system) return fail("Kategori sistem terkunci.");
    const { error } = await supabase.from("finance_categories").update(row).eq("id", id);
    if (error) return fail(error.code === "23505" ? "Nama kategori sudah dipakai." : `Gagal menyimpan: ${error.message}`);
    await financeLog(auth.userId, "category", id, `ubah kategori ${name}`, before, row);
  } else {
    const { data, error } = await supabase.from("finance_categories").insert(row).select("id").single();
    if (error) return fail(error.code === "23505" ? "Nama kategori sudah dipakai." : `Gagal menyimpan: ${error.message}`);
    id = data.id as string;
    await financeLog(auth.userId, "category", id, `tambah kategori ${name}`, null, row);
  }
  if (input.keywords) {
    const words = [...new Set(input.keywords.map((k) => k.toLowerCase()).filter((k) => k.trim()))];
    await supabase.from("finance_category_keywords").delete().eq("category_id", id).eq("source", "default");
    if (words.length) await supabase.from("finance_category_keywords").upsert(words.map((keyword) => ({ category_id: id, keyword, kind: input.kind, source: "default" })), { onConflict: "category_id,keyword" });
  }
  refresh();
  return { ok: true, message: `Kategori ${name} tersimpan.`, id };
}

/** Hapus kategori: belum dipakai → hapus; sudah dipakai → arsipkan, atau gabungkan ke kategori lain. */
export async function removeCategory(id: string, mergeIntoId?: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: cat } = await supabase.from("finance_categories").select("name, kind, is_system").eq("id", id).maybeSingle();
  if (!cat) return fail("Kategori tidak ditemukan.");
  if (cat.is_system) return fail("Kategori sistem terkunci.");
  if (mergeIntoId) {
    const { data: target } = await supabase.from("finance_categories").select("name, kind, is_system").eq("id", mergeIntoId).maybeSingle();
    if (!target || target.kind !== cat.kind || target.is_system || mergeIntoId === id) return fail("Kategori tujuan tidak valid.");
    const { error } = await supabase.from("finance_transactions").update({ category_id: mergeIntoId }).eq("category_id", id);
    if (error) return fail(`Gagal menggabungkan: ${error.message}`);
    await supabase.from("finance_categories").update({ is_archived: true, merged_into_id: mergeIntoId }).eq("id", id);
    await financeLog(auth.userId, "category", id, `gabungkan ${cat.name} → ${target.name}`, null, { merged_into_id: mergeIntoId });
    refresh();
    return done(`${cat.name} digabung ke ${target.name}.`);
  }
  const { count } = await supabase.from("finance_transactions").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (count) {
    await supabase.from("finance_categories").update({ is_archived: true }).eq("id", id);
    await financeLog(auth.userId, "category", id, `arsipkan ${cat.name}`, null, { is_archived: true });
    refresh();
    return done(`${cat.name} sudah dipakai ${count} transaksi — kategori diarsipkan.`);
  }
  const { error } = await supabase.from("finance_categories").delete().eq("id", id);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  await financeLog(auth.userId, "category", id, `hapus kategori ${cat.name}`, cat, null);
  refresh();
  return done(`Kategori ${cat.name} dihapus.`);
}

export async function restoreCategory(id: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("finance_categories").update({ is_archived: false, merged_into_id: null }).eq("id", id);
  if (error) return fail(`Gagal: ${error.message}`);
  await financeLog(auth.userId, "category", id, "aktifkan lagi kategori", null, { is_archived: false });
  refresh();
  return done("Kategori aktif lagi.");
}

// ── Pengaturan ───────────────────────────────────────────────────────────────
export async function saveFinanceSettings(input: {
  taxEnabled?: boolean;
  taxRate?: number | null;
  autoManualPaid?: boolean;
  autoKuyy?: boolean;
  autoShop?: boolean;
  autoDepreciation?: boolean;
  manualPaidAccountId?: string;
  defaultBankAccountId?: string;
  /** Tanggal (YYYY-MM-DD) mulai pencatatan otomatis. Dimajukan → activity sejak tanggal itu disinkronkan. */
  goLiveDate?: string;
}): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  if (input.goLiveDate !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(input.goLiveDate) && input.goLiveDate >= "2020-01-01" && input.goLiveDate <= "2100-12-31")) return fail("Tanggal go-live tidak valid (tahun 2020–2100).");
  if (input.taxRate !== undefined && input.taxRate !== null && !(input.taxRate >= 0 && input.taxRate <= 100)) return fail("Tarif pajak 0–100%.");
  const map: Record<string, string> = {
    taxEnabled: "tax_enabled",
    taxRate: "tax_rate",
    autoManualPaid: "auto_manual_paid",
    autoKuyy: "auto_kuyy",
    autoShop: "auto_shop",
    autoDepreciation: "auto_depreciation",
    manualPaidAccountId: "manual_paid_account_id",
    defaultBankAccountId: "default_bank_account_id",
    goLiveDate: "go_live_date",
  };
  const row = Object.fromEntries(Object.entries(input).filter(([k, v]) => k in map && v !== undefined).map(([k, v]) => [map[k], v]));
  if (!Object.keys(row).length) return fail("Tidak ada perubahan.");
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from("finance_settings").select("*").maybeSingle();
  const { error } = await supabase.from("finance_settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  await financeLog(auth.userId, "settings", null, "ubah pengaturan keuangan", before, row);
  // Go-live dimajukan → pemasukan peserta activity yang sudah selesai sejak tanggal itu dicatat sekarang.
  // Satu RPC per activity (bukan satu untuk semua): banyak activity sekaligus bisa melewati batas waktu
  // statement dan membatalkan semuanya.
  if (input.goLiveDate && before?.go_live_date && input.goLiveDate < (before.go_live_date as string)) {
    const { data: finished, error: listError } = await supabase
      .from("sessions")
      .select("id")
      .gte("starts_at", `${input.goLiveDate}T00:00:00+07:00`)
      .or("ended_at.not.is.null,status.eq.completed");
    // Beberapa sekaligus (bukan satu per satu): ratusan activity berurutan bisa melewati batas waktu fungsi.
    const failed: string[] = [];
    const queue = (finished ?? []).map((r) => r.id as string);
    await Promise.all(
      Array.from({ length: Math.min(5, queue.length) }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const { error: syncError } = await supabase.rpc("finance_resync_session", { p_session: id });
          if (syncError) failed.push(syncError.message);
        }
      }),
    );
    refresh();
    if (listError || failed.length) return fail(`Pengaturan tersimpan, tapi sinkron activity gagal: ${listError?.message ?? `${failed.length} activity — ${failed[0]}`}`);
    return done(`Pengaturan keuangan tersimpan · ${finished?.length ?? 0} activity sejak go-live disinkronkan.`);
  }
  refresh();
  return done("Pengaturan keuangan tersimpan.");
}

/**
 * Sync Keuangan satu activity: pemasukan peserta (Tiket Kuyy → Saldo Kuyy, Bayar manual → akun bayar
 * manual) dibaca ulang dari data activity — jalur, nominal & nama yang diubah sesudah activity selesai ikut
 * disamakan (lewat baris koreksi). Hanya untuk activity sejak go-live.
 */
export async function syncSessionFinance(sessionId: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const [{ data: session }, { data: settings }] = await Promise.all([
    supabase.from("sessions").select("starts_at").eq("id", sessionId).maybeSingle(),
    supabase.from("finance_settings").select("go_live_date").maybeSingle(),
  ]);
  const { data: count, error } = await supabase.rpc("finance_resync_session", { p_session: sessionId });
  if (error) return fail(`Gagal sinkron: ${error.message}`);
  await financeLog(auth.userId, "session", sessionId, "sinkron keuangan activity", null, { participants: count });
  refresh();
  // Pemasukan baru hanya dicatat sejak go-live (koreksi tetap jalan) — jangan bilang "tercatat" kalau belum.
  const startWib = session?.starts_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(session.starts_at as string)) : null;
  const goLive = settings?.go_live_date as string | undefined;
  if (startWib && goLive && startWib < goLive) {
    return done(`Activity ini sebelum go-live (${goLive}) — pemasukan peserta belum dicatat otomatis. Majukan go-live di Pengaturan Keuangan untuk mencatatnya.`);
  }
  return done(`Keuangan activity disinkronkan · ${count ?? 0} peserta dibaca ulang.`);
}

type TripSyncResult = { new: { name: string; kind: string; amount: number; date: string }[]; corrections: number; skipped_deleted: number; changes: number };

/** Pratinjau "Sync ke Keuangan" trip: pembayaran yang akan dicatat (belum menulis apa pun). */
export async function previewTripSync(
  tripId: string,
): Promise<{ ok: true; items: TripSyncResult["new"]; corrections: number; skippedDeleted: number } | { ok: false; error: string }> {
  const auth = await requireFinance("full");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finance_resync_trip", { p_trip: tripId, p_apply: false });
  if (error) return { ok: false, error: `Gagal membaca pembayaran trip: ${error.message}` };
  const r = data as TripSyncResult;
  return { ok: true, items: r.new, corrections: r.corrections, skippedDeleted: r.skipped_deleted };
}

/** Peserta & pembayaran trip · "Sync ke Keuangan": catat DP / cicilan / pelunasan yang belum masuk (termasuk sebelum go-live). */
export async function syncTripFinance(tripId: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finance_resync_trip", { p_trip: tripId, p_apply: true });
  if (error) return fail(`Gagal sinkron: ${error.message}`);
  const r = data as TripSyncResult;
  await financeLog(auth.userId, "trip", tripId, "sinkron keuangan trip", null, { recorded: r.new, corrections: r.corrections });
  refresh();
  revalidatePath(`/admin/activities/trip/${tripId}/peserta`);
  const skipped = r.skipped_deleted ? ` ${r.skipped_deleted} transaksi yang pernah dihapus tidak dibuat ulang.` : "";
  return done(r.changes ? `${r.changes} transaksi pembayaran trip dicatat ke Keuangan.${skipped}` : `Semua pembayaran trip sudah tercatat di Keuangan.${skipped}`);
}

// ── Neraca: saldo awal & pos manual (12n) ────────────────────────────────────
export async function saveOpeningBalance(accountId: string, amount: number, openingDate: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  if (!Number.isInteger(amount)) return fail("Saldo harus angka Rupiah.");
  if (!ymd.test(openingDate)) return fail("Tanggal saldo awal tidak valid.");
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from("finance_accounts").select("name, opening_balance, opening_date").eq("id", accountId).maybeSingle();
  if (!before) return fail("Akun tidak ditemukan.");
  const { error } = await supabase.from("finance_accounts").update({ opening_balance: amount, opening_date: openingDate }).eq("id", accountId);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  await financeLog(auth.userId, "account", accountId, `saldo awal ${before.name}`, before, { opening_balance: amount, opening_date: openingDate });
  refresh();
  return done(`Saldo awal ${before.name} tersimpan.`);
}

const ITEM_KEYS: BalanceItemKey[] = ["capital", "equipment", "receivable", "payable", "retained_earnings_opening", "other_asset", "other_liability"];

export async function saveBalanceItem(input: { id?: string; key: BalanceItemKey; label: string; amount: number; effectiveDate: string; salvage?: number; lifeMonths?: number; note?: string }): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  if (!ITEM_KEYS.includes(input.key)) return fail("Jenis pos tidak valid.");
  if (!input.label.trim()) return fail("Isi nama pos.");
  if (!Number.isInteger(input.amount)) return fail("Jumlah harus angka Rupiah.");
  if (!ymd.test(input.effectiveDate)) return fail("Tanggal tidak valid.");
  if (input.key === "equipment" && !(Number(input.lifeMonths) > 0)) return fail("Isi masa manfaat peralatan (bulan).");
  const row = {
    key: input.key,
    label: input.label.trim(),
    amount: input.amount,
    effective_date: input.effectiveDate,
    meta: input.key === "equipment" ? { salvage: Math.max(0, Math.round(input.salvage ?? 0)), life_months: Math.round(input.lifeMonths ?? 0) } : {},
    note: input.note?.trim() || null,
  };
  const supabase = await createSupabaseServerClient();
  if (input.id) {
    const { data: before } = await supabase.from("finance_balance_items").select("*").eq("id", input.id).maybeSingle();
    const { error } = await supabase.from("finance_balance_items").update(row).eq("id", input.id);
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
    await financeLog(auth.userId, "balance_item", input.id, `ubah pos ${row.label}`, before, row);
  } else {
    const { data, error } = await supabase.from("finance_balance_items").insert({ ...row, created_by: auth.userId }).select("id").single();
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
    await financeLog(auth.userId, "balance_item", data.id, `tambah pos ${row.label}`, null, row);
  }
  refresh();
  return done(`${row.label} tersimpan.`);
}

export async function deleteBalanceItem(id: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from("finance_balance_items").select("*").eq("id", id).maybeSingle();
  if (!before) return fail("Pos tidak ditemukan.");
  const { error } = await supabase.from("finance_balance_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  await financeLog(auth.userId, "balance_item", id, `hapus pos ${before.label}`, before, null);
  refresh();
  return done(`${before.label} dihapus.`);
}

// ── Target laba (12o) ────────────────────────────────────────────────────────
export async function saveTarget(year: number, amount: number, monthly: number[] | null): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  if (!Number.isInteger(year) || year < 2025 || year > 2100) return fail("Tahun tidak valid.");
  if (monthly && (monthly.length !== 12 || monthly.some((m) => !Number.isInteger(m) || m < 0))) return fail("Target per bulan harus 12 angka ≥ 0.");
  const total = monthly ? monthly.reduce((s, m) => s + m, 0) : amount;
  if (!Number.isInteger(total) || total < 0) return fail("Target harus angka Rupiah ≥ 0.");
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from("finance_targets").select("*").eq("year", year).maybeSingle();
  const row = { year, net_profit_target: total, monthly, updated_by: auth.userId, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("finance_targets").upsert(row);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  await financeLog(auth.userId, "target", String(year), `ubah target laba ${year}`, before, row);
  refresh();
  return done(`Target laba ${year} tersimpan.`);
}

// ── Import jurnal (§7) ───────────────────────────────────────────────────────
/** Langkah 1: baca file (XLSX/CSV, maks 5 MB) → baris teks. Parsing dilakukan di browser. */
export async function readImportFile(formData: FormData): Promise<{ ok: true; rows: string[][]; fileName: string } | { ok: false; error: string }> {
  // Membaca file tidak menyimpan apa pun → mode demo boleh mencoba wizard sampai tahap tinjau.
  if ((await getAdminSession()).mode !== "demo") {
    const auth = await requireFinance("full");
    if ("error" in auth) return { ok: false, error: auth.error };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file Excel (.xlsx) atau CSV dulu." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Ukuran file maksimal 5 MB." };
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".csv")) return { ok: true, rows: parseCsv(await file.text()), fileName: file.name };
    if (name.endsWith(".xlsx")) return { ok: true, rows: readFirstSheet(await file.arrayBuffer()), fileName: file.name };
  } catch (e) {
    return { ok: false, error: `File tidak bisa dibaca: ${(e as Error).message}` };
  }
  return { ok: false, error: "Format harus .xlsx atau .csv." };
}

function parseCsv(textIn: string): string[][] {
  const t = textIn.replace(/^﻿/, "");
  const sep = (t.split("\n")[0].match(/;/g)?.length ?? 0) > (t.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell.trim()]);
  return rows;
}

export type ImportCommitTx = {
  type: "income" | "expense" | "transfer";
  date: string;
  amount: number;
  description: string;
  account: string; // system_key akun kas
  toAccount: string | null;
  categoryId: string | null;
};

/** Langkah terakhir: simpan semua transaksi terpilih sebagai satu batch (bisa dibatalkan 24 jam). */
export async function commitImport(input: { fileName: string; period: string; defaultDate: string; rowsTotal: number; txs: ImportCommitTx[]; learn: { categoryId: string; keyword: string }[] }): Promise<ActionResult & { batchId?: string }> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const data = await getFinanceData();
  if (!input.txs.length) return fail("Tidak ada transaksi untuk diimpor.");
  if (input.txs.length > 2000) return fail("Maksimal 2.000 transaksi per import.");
  const accountBy = new Map(data.accounts.filter((a) => a.systemKey).map((a) => [a.systemKey!, a.id]));
  const rows = [];
  for (const [i, t] of input.txs.entries()) {
    const n = `Transaksi ${i + 1}`;
    if (!ymd.test(t.date)) return fail(`${n}: tanggal tidak valid.`);
    if (t.date >= data.settings.goLiveDate) return fail(`${n}: bertanggal sejak go-live (${data.settings.goLiveDate}) — data sejak go-live dicatat dari Activities & form transaksi.`);
    if (!Number.isInteger(t.amount) || t.amount <= 0) return fail(`${n}: jumlah tidak valid.`);
    const accountId = accountBy.get(t.account);
    const toAccountId = t.toAccount ? accountBy.get(t.toAccount) : null;
    if (!accountId) return fail(`${n}: akun tidak dikenal.`);
    if (t.type === "transfer") {
      if (!toAccountId || toAccountId === accountId) return fail(`${n}: akun transfer tidak valid.`);
    } else {
      const cat = data.categories.find((c) => c.id === t.categoryId);
      if (!cat || cat.kind !== t.type || cat.isSystem) return fail(`${n}: pilih kategori ${t.type === "income" ? "pemasukan" : "pengeluaran"}.`);
    }
    rows.push({
      type: t.type,
      date: t.date,
      recognized_on: t.date,
      amount: t.amount,
      category_id: t.type === "transfer" ? null : t.categoryId,
      account_id: accountId,
      to_account_id: t.type === "transfer" ? toAccountId : null,
      description: t.description.slice(0, 200) || "(tanpa keterangan)",
      source: "import",
      created_by: auth.userId,
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data: batch, error: batchError } = await supabase
    .from("finance_import_batches")
    .insert({ file_name: input.fileName.slice(0, 200), format: "journal", period_month: input.period, default_date: input.defaultDate, rows_total: input.rowsTotal, tx_total: rows.length, created_by: auth.userId })
    .select("id")
    .single();
  if (batchError || !batch) return fail(`Gagal menyimpan batch: ${batchError?.message}`);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("finance_transactions").insert(rows.slice(i, i + 500).map((r) => ({ ...r, import_batch_id: batch.id })));
    if (error) {
      await supabase.from("finance_transactions").update({ deleted_at: new Date().toISOString(), deleted_reason: "import gagal" }).eq("import_batch_id", batch.id);
      await supabase.from("finance_import_batches").update({ status: "undone", undone_at: new Date().toISOString() }).eq("id", batch.id);
      return fail(`Import gagal, tidak ada transaksi yang tersimpan: ${error.message}`);
    }
  }
  // Pilihan admin → kata kunci "learned" untuk saran berikutnya.
  const learn = input.learn.filter((l) => l.keyword.trim().length >= 3 && data.categories.some((c) => c.id === l.categoryId));
  if (learn.length) {
    await supabase.from("finance_category_keywords").upsert(
      learn.map((l) => ({ category_id: l.categoryId, keyword: l.keyword.trim().toLowerCase(), kind: data.categories.find((c) => c.id === l.categoryId)!.kind, source: "learned" })),
      { onConflict: "category_id,keyword", ignoreDuplicates: true },
    );
  }
  await financeLog(auth.userId, "import", batch.id, `import ${input.fileName} (${rows.length} transaksi)`, null, { period: input.period, tx_total: rows.length });
  refresh();
  return { ok: true, message: `${rows.length} transaksi dari ${input.fileName} berhasil diimpor.`, batchId: batch.id as string };
}

/** Batalkan import (soft delete satu batch) — hanya dalam 24 jam. */
export async function undoImport(batchId: string): Promise<ActionResult> {
  const auth = await requireFinance("full");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: batch } = await supabase.from("finance_import_batches").select("file_name, status, undo_until, tx_total").eq("id", batchId).maybeSingle();
  if (!batch) return fail("Batch import tidak ditemukan.");
  if (batch.status !== "imported") return fail("Import ini sudah dibatalkan.");
  if (new Date(batch.undo_until).getTime() < Date.now()) return fail("Batas 24 jam untuk membatalkan import sudah lewat.");
  const now = new Date().toISOString();
  const { error } = await supabase.from("finance_transactions").update({ deleted_at: now, deleted_reason: "import dibatalkan" }).eq("import_batch_id", batchId).is("deleted_at", null);
  if (error) return fail(`Gagal membatalkan: ${error.message}`);
  await supabase.from("finance_import_batches").update({ status: "undone", undone_at: now }).eq("id", batchId);
  await financeLog(auth.userId, "import", batchId, `batalkan import ${batch.file_name}`, null, null);
  refresh();
  return done(`Import ${batch.file_name} dibatalkan — ${batch.tx_total} transaksi dihapus.`);
}

// ── Activities: "Tandai Lunas" (A-7) ─────────────────────────────────────────
/**
 * Tandai booking lunas / batal lunas (bayar manual). Lewat RPC mark_booking_paid: status pembayaran
 * berubah dan Keuangan mencatat Tiket activity ke akun default pembayaran manual (Rp0 → tidak ada
 * transaksi; batal lunas → koreksi). Admin Activities atau host sesi itu.
 */
export async function markBookingPaid(bookingId: string, paid: boolean): Promise<ActionResult> {
  const session = await getAdminSession();
  if (session.mode === "demo") return fail(DEMO_ERROR);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_booking_paid", { p_booking: bookingId, p_paid: paid });
  if (error) return fail(error.code === "42501" ? "Kamu tidak punya izin menandai pembayaran." : `Gagal menyimpan: ${error.message}`);
  revalidatePath("/admin/activities", "layout");
  refresh();
  return done(paid ? "Ditandai lunas." : "Tanda lunas dibatalkan.");
}
