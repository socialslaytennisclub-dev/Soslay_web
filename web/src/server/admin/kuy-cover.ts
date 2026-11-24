import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { discardUploads, IMAGE_TYPES, uploadPublicImage } from "../storage";
import { audit, PUBLIC_SESSION_PATHS, refreshPaths, requireEditor } from "./actions/common";
import { monthKey } from "./time";

/**
 * Foto cover activity dari gambar event Kuyy (dipakai MCP Claude): server mengunduh gambar dari CDN Kuyy,
 * meng-upload-nya ke bucket cover Slay Club (sama dengan upload manual di Activity Editor), lalu URL
 * hasil upload itu yang disimpan — website tidak pernah memuat gambar langsung dari Kuyy.
 * Sengaja BUKAN "use server": fungsi yang mengunduh URL tidak boleh jadi server action publik.
 */

export const SESSION_COVER_BUCKET = "session-covers";
export const SESSION_COVER_MAX_BYTES = 5 * 1024 * 1024;

/** Hapus upload cover yang tidak lagi dipakai sesi mana pun (aman untuk URL yang masih dipakai / bukan milik bucket). */
export const discardSessionCover = (url: string | null | undefined) =>
  url ? discardUploads(SESSION_COVER_BUCKET, [url], { table: "sessions", columns: ["cover_path", "photo_cover_path"] }) : Promise.resolve();

/** Hanya CDN gambar Kuyy (https) — bukan URL bebas, supaya server tidak bisa disuruh membuka alamat lain. */
const KUY_IMAGE_HOSTS = /^(static\.kuyy\.app|static\.kuyy\.id)$/;

export function kuyCoverUrlError(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !KUY_IMAGE_HOSTS.test(url.hostname)) return "Foto cover harus link gambar dari static.kuyy.app.";
    return null;
  } catch {
    return "Link foto cover tidak valid.";
  }
}

/** Unduh gambar event Kuyy lalu upload ke bucket cover. Hasil: URL publik milik Slay Club. */
export async function uploadKuyCover(raw: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const invalid = kuyCoverUrlError(raw);
  if (invalid) return { ok: false, error: invalid };

  // Seluruh unduhan (header + isi) di dalam try: timeout / koneksi putus di tengah jadi pesan gagal, bukan exception.
  let type: string;
  let bytes: ArrayBuffer;
  try {
    const res = await fetch(raw.trim(), { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Gagal mengunduh foto dari Kuyy (HTTP ${res.status}).` };
    type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES[type]) return { ok: false, error: `Link itu bukan foto JPG/PNG/WebP (${type || "tipe tidak diketahui"}).` };
    if (Number(res.headers.get("content-length") ?? 0) > SESSION_COVER_MAX_BYTES) return { ok: false, error: "Foto dari Kuyy lebih dari 5 MB." };
    bytes = await res.arrayBuffer();
  } catch (e) {
    return { ok: false, error: `Gagal mengunduh foto dari Kuyy (${e instanceof Error ? e.message : "jaringan"}).` };
  }

  const file = new File([bytes], `kuyy-cover.${IMAGE_TYPES[type]}`, { type });
  const result = await uploadPublicImage({ bucket: SESSION_COVER_BUCKET, file, folder: monthKey(new Date()), maxBytes: SESSION_COVER_MAX_BYTES });
  if (!result.ok) return result;
  await audit(auth.userId, "session.cover_upload", "session_cover", result.path);
  return { ok: true, url: result.url };
}

/** Pasang foto cover Kuyy ke activity yang sudah ada (cover lama diganti). */
export async function setSessionCoverFromKuy(sessionId: string, raw: string): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.from("sessions").select("id, title, cover_path").eq("id", sessionId).maybeSingle();
  if (!session) return { ok: false, error: "Activity tidak ditemukan." };

  const uploaded = await uploadKuyCover(raw);
  if (!uploaded.ok) return uploaded;
  // .select(): update yang ditolak RLS tidak memberi error, hanya 0 baris — itu juga gagal.
  const { data: updated, error } = await supabase.from("sessions").update({ cover_path: uploaded.url }).eq("id", sessionId).select("id");
  if (error || !updated?.length) {
    await discardSessionCover(uploaded.url);
    return { ok: false, error: `Gagal menyimpan foto cover${error ? `: ${error.message}` : " (tidak ada izin mengubah activity ini)"}.` };
  }
  // Cover lama hasil upload dibuang (hanya bila tidak dipakai sesi lain).
  if (session.cover_path && session.cover_path !== uploaded.url) await discardSessionCover(session.cover_path);
  await audit(auth.userId, `memasang foto cover Kuyy di activity ${session.title}`, "session", sessionId);
  refreshPaths(...PUBLIC_SESSION_PATHS, `/admin/activities/${sessionId}`);
  return { ok: true, title: session.title };
}
