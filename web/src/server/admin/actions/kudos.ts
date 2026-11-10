"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refreshPaths, requireEditor, type ActionResult } from "./common";

/**
 * Hapus kudos (BR-23 · K-10): soft delete dengan alasan wajib; RPC admin_delete_kudos menarik poin pemberi
 * (−1) dan mencatat aktor, waktu, alasan & data kudos di Log aktivitas admin.
 */
export async function deleteKudos(sessionId: string, kudosId: string, reason: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const why = reason.trim();
  if (!why) return { ok: false, error: "Alasan hapus wajib diisi." };
  if (why.length > 300) return { ok: false, error: "Alasan maksimal 300 karakter." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_kudos", { p_kudos: kudosId, p_reason: why });
  if (error) return { ok: false, error: error.code === "PT409" ? "Kudos ini sudah dihapus." : `Gagal menghapus kudos: ${error.message}` };
  refreshPaths(`/admin/activities/${sessionId}`);
  return { ok: true, message: "Kudos dihapus · Slay Point pemberi ditarik (−1)." };
}
