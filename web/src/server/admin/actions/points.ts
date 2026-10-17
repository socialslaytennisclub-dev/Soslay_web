"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIER_LABEL } from "@/lib/admin-labels";
import { segmentMemberIds } from "../repo";
import type { PointRules, RedemptionStatus, RewardCategory, Tier } from "../types";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Slay Point & Reward: katalog, penukaran, aturan, tier, bonus massal. Izin = modul Members (CRM). */

const refresh = () => refreshPaths("/admin/points", ["/admin/members", "layout"]);
const CATEGORIES: RewardCategory[] = ["merch", "session", "voucher", "experience"];
const TIERS: Tier[] = ["basic", "silver", "gold", "platinum"];
const isWhole = (n: number, min = 0, max = 1_000_000) => Number.isInteger(n) && n >= min && n <= max;

// ── Katalog reward ──────────────────────────────────────────────────────────
export type RewardInput = {
  name: string;
  description: string;
  category: RewardCategory;
  image: string | null;
  pointsCost: number;
  stock: number | null;
  minTier: Tier;
  active: boolean;
};

function validateReward(input: RewardInput): string | null {
  if (input.name.trim().length < 2 || input.name.trim().length > 80) return "Nama reward 2–80 karakter.";
  if (input.description.length > 500) return "Deskripsi maksimal 500 karakter.";
  if (!CATEGORIES.includes(input.category)) return "Kategori tidak valid.";
  if (!TIERS.includes(input.minTier)) return "Tier tidak valid.";
  if (!isWhole(input.pointsCost, 1)) return "Harga poin harus angka bulat mulai 1.";
  if (input.stock !== null && !isWhole(input.stock, 0, 100_000)) return "Stok harus angka bulat ≥ 0 (kosongkan untuk tanpa batas).";
  return null;
}

/** id kosong → reward baru. Mengembalikan id agar editor bisa pindah ke reward yang baru dibuat. */
export async function saveReward(id: string, input: RewardInput): Promise<ActionResult & { id?: string }> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const invalid = validateReward(input);
  if (invalid) return fail(invalid);
  const supabase = await createSupabaseServerClient();
  const row = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    category: input.category,
    image: input.image || null,
    points_cost: input.pointsCost,
    stock: input.stock,
    min_tier: input.minTier,
    is_active: input.active,
  };
  const { data, error } = id
    ? await supabase.from("rewards").update(row).eq("id", id).select("id").single()
    : await supabase.from("rewards").insert(row).select("id").single();
  if (error) return fail(`Gagal menyimpan reward: ${error.message}`);
  await audit(auth.userId, `${id ? "mengubah" : "menambah"} reward ${row.name}`, "reward", data.id as string);
  refresh();
  return { ...done(id ? "Reward tersimpan." : `${row.name} ditambahkan ke katalog.`), id: data.id as string };
}

export async function deleteReward(id: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("reward_redemptions").select("id", { count: "exact", head: true }).eq("reward_id", id);
  if (count) return fail("Reward ini sudah pernah ditukar — nonaktifkan saja agar riwayat penukaran tetap utuh.");
  const { data, error } = await supabase.from("rewards").delete().eq("id", id).select("name").single();
  if (error) return fail(`Gagal menghapus reward: ${error.message}`);
  await audit(auth.userId, `menghapus reward ${data.name}`, "reward", id);
  refresh();
  return done(`${data.name} dihapus.`);
}

// ── Penukaran ───────────────────────────────────────────────────────────────
/** Admin mencatat penukaran atas nama member (mis. di lapangan). Status awal "Menunggu". */
export async function createRedemption(memberId: string, rewardId: string, note: string): Promise<ActionResult & { code?: string }> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!memberId || !rewardId) return fail("Pilih member dan reward.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .insert({ member_id: memberId, reward_id: rewardId, points: 1, note: note.trim() || null })
    .select("code")
    .single();
  if (error) return fail(`Gagal mencatat penukaran: ${error.message}`);
  await audit(auth.userId, `mencatat penukaran #${data.code}`, "redemption", data.code as string);
  refresh();
  return { ...done(`#${data.code} dicatat — setujui untuk memotong poin.`), code: data.code as string };
}

const STATUS_MESSAGE: Record<Exclude<RedemptionStatus, "pending">, string> = {
  approved: "disetujui — poin member sudah dipotong",
  fulfilled: "selesai — reward sudah diterima member",
  rejected: "ditolak",
};

export async function processRedemption(code: string, status: Exclude<RedemptionStatus, "pending">, note: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (status === "rejected" && !note.trim()) return fail("Tulis alasan penolakan — dikirim ke member.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_redemption_status", { p_code: code, p_status: status, p_note: note.trim() || null });
  if (error) return fail(error.message);
  await audit(auth.userId, `${{ approved: "menyetujui", fulfilled: "menyelesaikan", rejected: "menolak" }[status]} penukaran #${code}`, "redemption", code);
  refresh();
  return done(`#${code} ${STATUS_MESSAGE[status]}.`);
}

// ── Aturan poin ─────────────────────────────────────────────────────────────
export async function savePointRules(rules: PointRules): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  const numbers = [
    ...Object.values(rules.attendance),
    ...rules.bonuses.map((b) => b.points),
    rules.redeemDiscount.rupiahPerPoint,
  ];
  if (numbers.some((n) => !isWhole(n, 0, 100_000))) return fail("Poin harus angka bulat 0–100.000.");
  if (!isWhole(rules.rupiahPerPoint, 1000, 10_000_000)) return fail("Belanja per poin minimal Rp1.000.");
  if (!isWhole(rules.redeemDiscount.maxPercent, 1, 100)) return fail("Batas potongan 1–100%.");
  if (!isWhole(rules.expiry.months, 1, 120)) return fail("Masa berlaku 1–120 bulan.");

  const { rupiahPerPoint, ...stored } = rules;
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "points_rules", value: stored, updated_at: now },
      { key: "rupiah_per_point", value: rupiahPerPoint, updated_at: now },
    ],
    { onConflict: "key" },
  );
  if (error) return fail(`Gagal menyimpan aturan: ${error.message}`);
  await audit(auth.userId, "mengubah aturan Slay Point", "settings", "points_rules");
  refreshPaths("/admin/points", "/admin/settings", "/admin/activities/new");
  return done("Aturan poin tersimpan — berlaku untuk poin berikutnya.");
}

// ── Tier & benefit ──────────────────────────────────────────────────────────
export async function saveTier(tier: Tier, minPoints: number, benefits: string[]): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!TIERS.includes(tier)) return fail("Tier tidak valid.");
  if (!isWhole(minPoints, 0, 10_000_000)) return fail("Batas poin harus angka bulat ≥ 0.");
  if (tier === "basic" && minPoints !== 0) return fail("Tier Basic selalu mulai dari 0 poin.");
  const list = benefits.map((b) => b.trim()).filter(Boolean);
  if (list.length > 10 || list.some((b) => b.length > 80)) return fail("Maksimal 10 benefit, masing-masing 80 karakter.");

  const supabase = await createSupabaseServerClient();
  const { data: tiers } = await supabase.from("membership_tiers").select("tier, min_points").order("sort_order");
  const index = TIERS.indexOf(tier);
  const prev = tiers?.find((t) => t.tier === TIERS[index - 1])?.min_points as number | undefined;
  const next = tiers?.find((t) => t.tier === TIERS[index + 1])?.min_points as number | undefined;
  if ((prev !== undefined && minPoints <= prev) || (next !== undefined && minPoints >= next))
    return fail("Batas poin harus di antara tier sebelum dan sesudahnya (Basic < Silver < Gold < Platinum).");

  const { error } = await supabase.from("membership_tiers").update({ min_points: minPoints, benefits: list }).eq("tier", tier);
  if (error) return fail(`Gagal menyimpan tier: ${error.message}`);
  await audit(auth.userId, `mengubah tier ${TIER_LABEL[tier]}`, "tier", tier);
  refreshPaths("/admin/points", "/admin/settings");
  return done(`Tier ${TIER_LABEL[tier]} tersimpan.`);
}

// ── Bonus massal ────────────────────────────────────────────────────────────
export async function sendBulkBonus(segmentId: string, points: number, reason: string): Promise<ActionResult> {
  const auth = await requireEditor("members");
  if ("error" in auth) return fail(auth.error);
  if (!isWhole(points, 1, 100_000)) return fail("Jumlah poin harus angka bulat 1–100.000.");
  if (!reason.trim()) return fail("Tulis alasan — tampil di riwayat poin member.");
  const ids = await segmentMemberIds(segmentId);
  if (!ids) return fail("Segmen tidak ditemukan.");
  if (!ids.length) return fail("Segmen ini belum punya member aktif.");

  const supabase = await createSupabaseServerClient();
  // Satu insert = satu statement → semua member dapat bonus, atau tidak sama sekali.
  const rows = ids.map((id) => ({ member_id: id, delta: points, reason: "bonus", note: reason.trim(), created_by: auth.userId }));
  const { error } = await supabase.from("points_ledger").insert(rows);
  if (error) return fail(`Gagal mengirim bonus: ${error.message}`);
  await audit(auth.userId, `mengirim bonus +${points} ke ${ids.length} member`, "points", segmentId);
  refresh();
  return done(`+${points.toLocaleString("id-ID")} pts terkirim ke ${ids.length.toLocaleString("id-ID")} member.`);
}
