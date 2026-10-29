import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/env";

/**
 * Upload foto ke bucket publik Supabase Storage lewat service role — selalu SETELAH cek izin
 * pemanggil (requireEditor / sesi member), jadi tidak perlu policy RLS di storage.objects.
 * Bucket dibuat otomatis saat upload pertama (skema `storage` tidak ada di PGlite check-migrations).
 */

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadResult = { ok: true; url: string; path: string } | { ok: false; error: string };

export async function uploadPublicImage({
  bucket,
  file,
  folder,
  maxBytes,
  types = IMAGE_TYPES,
}: {
  bucket: string;
  file: FormDataEntryValue | null;
  /** Folder di dalam bucket, mis. "2026-10" atau id member. */
  folder: string;
  maxBytes: number;
  types?: Record<string, string>;
}): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file foto dulu." };
  const ext = types[file.type];
  if (!ext) return { ok: false, error: `Format harus ${Object.values(types).map((t) => t.toUpperCase()).join(", ").replace(/, ([^,]*)$/, " atau $1")}.` };
  if (file.size > maxBytes) return { ok: false, error: `Ukuran foto maksimal ${Math.round(maxBytes / 1024 / 1024)} MB.` };

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Upload belum aktif: SUPABASE_SERVICE_ROLE_KEY belum dipasang." };

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const upload = () => admin.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  let { error } = await upload();
  // Upload pertama di project baru: bucket belum ada → buat sekali, lalu ulangi.
  if (error && /bucket not found/i.test(error.message)) {
    const created = await admin.storage.createBucket(bucket, { public: true, fileSizeLimit: maxBytes, allowedMimeTypes: Object.keys(types) });
    if (created.error && !/already exists/i.test(created.error.message)) return { ok: false, error: `Gagal menyiapkan Storage: ${created.error.message}` };
    ({ error } = await upload());
  }
  if (error) return { ok: false, error: `Gagal upload: ${error.message}` };
  return { ok: true, path, url: admin.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** Prefix URL publik bucket ini (untuk memastikan URL yang dikirim form memang hasil upload kita). */
export const publicBucketPrefix = (bucket: string) => `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;

/** Key hasil uploadPublicImage: <folder>/<uuid>.<ext> — tanpa "../" atau path lain. */
const UPLOAD_KEY = /^[\w-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** URL ini file hasil uploadPublicImage di bucket ini? */
export const isOwnUpload = (bucket: string, url: string) => {
  const prefix = publicBucketPrefix(bucket);
  return url.startsWith(prefix) && UPLOAD_KEY.test(url.slice(prefix.length));
};

/**
 * Buang upload yang tidak jadi dipakai (diganti sebelum Simpan): hanya file hasil upload di bucket ini
 * yang tidak lagi direferensikan kolom `columns` di tabel `table` (baris mana pun). Cek referensi
 * gagal → tidak ada yang dihapus.
 */
export async function discardUploads(bucket: string, urls: string[], { table, columns }: { table: string; columns: string[] }) {
  const own = [...new Set(urls)].filter((u) => isOwnUpload(bucket, u));
  const admin = createSupabaseAdminClient();
  if (!own.length || !admin) return;
  const list = own.map((u) => `"${u}"`).join(",");
  const { data, error } = await admin.from(table).select(columns.join(", ")).or(columns.map((c) => `${c}.in.(${list})`).join(","));
  if (error) return;
  const keep = new Set((data as unknown as Record<string, unknown>[]).flatMap((row) => columns.map((c) => row[c])));
  const prefix = publicBucketPrefix(bucket);
  const paths = own.filter((u) => !keep.has(u)).map((u) => u.slice(prefix.length));
  if (paths.length) await admin.storage.from(bucket).remove(paths);
}

/** Hapus file lama (URL publik bucket ini); diam-diam diabaikan bila gagal / bukan file bucket. */
export async function removePublicImage(bucket: string, url: string | null | undefined) {
  const prefix = publicBucketPrefix(bucket);
  if (!url?.startsWith(prefix)) return;
  await createSupabaseAdminClient()?.storage.from(bucket).remove([url.slice(prefix.length)]);
}
