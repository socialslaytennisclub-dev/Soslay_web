"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit, refreshPaths, requireEditor, type ActionResult } from "./common";

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

/**
 * Kategori kudos (BR-23 · K-5): tambah / ubah label / aktif-nonaktif tanpa deploy. Kategori nonaktif tidak
 * bisa dipilih lagi, tetapi kudos lama tetap terhitung. Key dibuat dari label dan tidak berubah (kudos
 * menyimpan key). Hak: Settings edit (sama dengan policy "admin manage kudos categories").
 */
export async function saveKudosCategory(input: { key?: string; label: string; group: "skill" | "attitude"; active: boolean }): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return { ok: false, error: auth.error };
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Nama kategori wajib diisi." };
  if (label.length > 40) return { ok: false, error: "Nama kategori maksimal 40 karakter." };
  if (input.group !== "skill" && input.group !== "attitude") return { ok: false, error: "Grup tidak valid." };
  const supabase = await createSupabaseServerClient();
  if (input.key) {
    const { error } = await supabase.from("kudos_categories").update({ label, group: input.group, is_active: input.active }).eq("key", input.key);
    if (error) return { ok: false, error: `Gagal menyimpan kategori: ${error.message}` };
  } else {
    const key = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "k_$1").slice(0, 40);
    if (!key) return { ok: false, error: "Nama kategori harus berisi huruf atau angka." };
    const { data: last } = await supabase.from("kudos_categories").select("sort_order").eq("group", input.group).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("kudos_categories").insert({ key, label, group: input.group, is_active: input.active, sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10 });
    if (error) return { ok: false, error: error.code === "23505" ? `Kategori "${label}" sudah ada.` : `Gagal menambah kategori: ${error.message}` };
  }
  await audit(auth.userId, `${input.key ? "mengubah" : "menambah"} kategori kudos ${label}${input.active ? "" : " (nonaktif)"}`, "kudos_category", input.key ?? label);
  refreshPaths("/admin/points");
  return { ok: true, message: input.key ? `Kategori ${label} disimpan.` : `Kategori ${label} ditambahkan.` };
}
