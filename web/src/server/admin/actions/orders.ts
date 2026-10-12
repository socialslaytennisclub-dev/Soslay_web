"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Proses order Shop: kirim (kurir + resi), selesai, atau batal. */

export type OrderUpdate =
  | { action: "ship"; courier: string; tracking: string }
  | { action: "complete" }
  | { action: "cancel" };

export async function updateOrder(code: string, update: OrderUpdate): Promise<ActionResult> {
  const auth = await requireEditor("orders");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase.from("orders").select("id, status, payment_status").eq("code", code).maybeSingle();
  if (!order) return fail("Order tidak ditemukan.");
  const now = new Date().toISOString();

  let change: Record<string, unknown>;
  let message: string;
  if (update.action === "ship") {
    if (!update.tracking.trim()) return fail("Isi nomor resi dulu sebelum menandai dikirim.");
    if (order.payment_status !== "paid") return fail("Order belum dibayar.");
    if (!["pending", "processing"].includes(order.status as string)) return fail("Order ini sudah diproses.");
    change = { status: "shipped", courier: update.courier, tracking_number: update.tracking.trim().toUpperCase(), shipped_at: now };
    message = `#${code} ditandai dikirim (${update.courier}).`;
  } else if (update.action === "complete") {
    if (order.status !== "shipped") return fail("Hanya order yang sedang dikirim yang bisa diselesaikan.");
    change = { status: "completed", completed_at: now };
    message = `#${code} selesai — diterima customer.`;
  } else {
    if (!["pending", "processing"].includes(order.status as string)) return fail("Order yang sudah dikirim tidak bisa dibatalkan.");
    change = { status: "cancelled", cancelled_at: now };
    message = `#${code} dibatalkan. Jangan lupa proses refund bila sudah dibayar.`;
  }

  const { error } = await supabase.from("orders").update(change).eq("id", order.id);
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  const verb = { ship: "menandai dikirim", complete: "menyelesaikan", cancel: "membatalkan" }[update.action];
  await audit(auth.userId, `${verb} #${code}`, "order", order.id as string);
  refreshPaths("/admin/orders");
  return done(message);
}
