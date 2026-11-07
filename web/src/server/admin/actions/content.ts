"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPostPlatform, normalizeHandle, POST_PLATFORMS, postLinkError, type InstagramSectionJson, type PostPlatform, type StoredPost } from "@/lib/community-posts";
import { detectVideoPlatform } from "@/lib/video";
import { IMAGE_TYPES, isOwnUpload, removeOwnUploads, uploadPublicImage } from "../../storage";
import { postsFromSection, readInstagramSection } from "../../community-posts";
import { findMemberById } from "../identity";
import type { AdminTestimonial, ContentSection } from "../types";
import { revalidatePath } from "next/cache";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Konten & Galeri → homepage website (content_sections, testimonials, post Instagram/TikTok/Threads). */

const isLink = (href: string) => /^(\/|https:\/\/)/.test(href);

/** Simpan isi + urutan + aktif semua section, lalu tayangkan di homepage. */
export async function publishHomepage(sections: ContentSection[]): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);

  for (const s of sections) {
    if (!s.title.trim()) return fail(`Judul section "${s.name}" wajib diisi.`);
    if (s.description.length > s.maxLength) return fail(`Deskripsi "${s.name}" melebihi ${s.maxLength} karakter.`);
    if (s.cta && (!s.cta.label.trim() || !isLink(s.cta.href))) return fail(`Tombol di "${s.name}" butuh label dan link (diawali / atau https://).`);
  }

  const supabase = await createSupabaseServerClient();
  // Isi tersimpan yang tidak diedit di sini (mis. daftar post Instagram) tetap dipertahankan.
  const { data: current } = await supabase.from("content_sections").select("key, published").eq("page", "home");
  const storedByKey = new Map((current ?? []).map((r) => [r.key as string, (r.published ?? {}) as Record<string, unknown>]));
  const now = new Date().toISOString();

  const rows = sections.map((s, i) => {
    const body = { ...storedByKey.get(s.key), title: s.title.trim(), description: s.description.trim(), cta: s.cta ?? null, image: s.image ?? null, overlay: s.overlay ?? null };
    return { page: "home", key: s.key, label: s.name, draft: body, published: body, is_enabled: s.enabled, sort_order: i, updated_by: auth.userId, updated_at: now, published_at: now };
  });
  const { error } = await supabase.from("content_sections").upsert(rows, { onConflict: "page,key" });
  if (error) return fail(`Gagal mempublikasikan: ${error.message}`);

  await audit(auth.userId, "mempublikasikan homepage", "content", "home");
  refreshPaths("/", "/admin/konten");
  return done("Homepage dipublikasikan — perubahan sudah tampil di website.");
}

export async function setTestimonialVisible(id: string, visible: boolean): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("testimonials").update({ is_published: visible }).eq("id", id).select("author_name");
  if (error || !data?.length) return fail(`Gagal mengubah: ${error?.message ?? "testimoni tidak ditemukan"}`);
  await audit(auth.userId, `${visible ? "menampilkan" : "menyembunyikan"} testimoni ${data[0].author_name}`, "testimonial", id);
  refreshPaths("/", "/admin/konten");
  return done(visible ? "Testimoni tampil di homepage." : "Testimoni disembunyikan dari homepage.");
}

// ── Testimoni (Figma 09b–09f) ───────────────────────────────────────────────
export type TestimonialInput = Pick<AdminTestimonial, "kind" | "name" | "handle" | "quote" | "memberId" | "sortOrder" | "visible" | "videoUrl" | "durationSeconds">;

function validateTestimonial(t: TestimonialInput): string | null {
  if (t.name.trim().length < 2 || t.name.trim().length > 80) return "Nama 2–80 karakter.";
  if (t.handle.trim().length > 40) return "Instagram maksimal 40 karakter.";
  if (t.quote.trim().length > 200) return "Kutipan maksimal 200 karakter.";
  if (t.kind === "text" && !t.quote.trim()) return "Kutipan wajib diisi untuk testimoni teks.";
  if (t.kind === "video" && !detectVideoPlatform(t.videoUrl ?? "")) return "Tempel link Instagram Reels, TikTok, atau YouTube Shorts.";
  if (!Number.isInteger(t.sortOrder) || t.sortOrder < 0 || t.sortOrder > 999) return "Urutan tampil 0–999.";
  if (t.durationSeconds !== null && (!Number.isInteger(t.durationSeconds) || t.durationSeconds < 1 || t.durationSeconds > 180)) return "Durasi video 1–180 detik (maks 60 detik disarankan).";
  return null;
}

/** id kosong → testimoni baru. */
export async function saveTestimonial(id: string, input: TestimonialInput): Promise<ActionResult & { id?: string }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  const invalid = validateTestimonial(input);
  if (invalid) return fail(invalid);
  const handle = input.handle.trim().replace(/^@?/, input.handle.trim() ? "@" : "");
  const row = {
    kind: input.kind,
    author_name: input.name.trim(),
    author_handle: handle || null,
    quote: input.quote.trim(),
    member_id: input.memberId || null,
    sort_order: input.sortOrder,
    is_published: input.visible,
    video_url: input.kind === "video" ? input.videoUrl!.trim() : null,
    video_platform: input.kind === "video" ? detectVideoPlatform(input.videoUrl ?? "") : null,
    duration_seconds: input.kind === "video" ? input.durationSeconds : null,
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = id
    ? await supabase.from("testimonials").update(row).eq("id", id).select("id").single()
    : await supabase.from("testimonials").insert(row).select("id").single();
  if (error) return fail(`Gagal menyimpan testimoni: ${error.message}`);
  await audit(auth.userId, `${id ? "mengubah" : "menambah"} testimoni ${row.author_name}`, "testimonial", data.id as string);
  refreshPaths("/", "/admin/konten");
  return { ...done(id ? "Testimoni tersimpan." : "Testimoni ditambahkan."), id: data.id as string };
}

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("testimonials").delete().eq("id", id).select("author_name");
  if (error || !data?.length) return fail(`Gagal menghapus: ${error?.message ?? "testimoni tidak ditemukan"}`);
  await audit(auth.userId, `menghapus testimoni ${data[0].author_name}`, "testimonial", id);
  refreshPaths("/", "/admin/konten");
  return done(`Testimoni ${data[0].author_name} dihapus.`);
}

/**
 * Halaman yang menampilkan feed post (InstagramFeed) — dimuat ulang setelah post diubah. Tanpa
 * refreshPaths: post tidak ada di dataset admin, jadi cache dataset tidak perlu dibuang.
 */
function refreshFeed() {
  for (const path of ["/", "/activity", "/shop", "/admin/konten"]) revalidatePath(path);
  revalidatePath("/activity/[type]", "page");
  revalidatePath("/shop/[slug]", "page");
}

/**
 * Baca daftar post (atau konten statis), ubah, lalu simpan ke draft & published section Instagram.
 * Disimpan hanya bila baris belum diubah orang lain sejak dibaca (updated_at sama) — kalau berubah,
 * baca ulang & terapkan lagi, supaya dua admin yang menyimpan bersamaan tidak saling menimpa.
 */
async function writePosts(change: (posts: StoredPost[]) => StoredPost[] | string): Promise<{ error: string } | { posts: StoredPost[] }> {
  const supabase = await createSupabaseServerClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readError } = await supabase.from("content_sections").select("draft, published, updated_at").eq("page", "home").eq("key", "instagram").maybeSingle();
    if (readError || !row) return { error: "Section Instagram belum ada — publikasikan homepage sekali dulu." };
    const next = change(postsFromSection(row.published as InstagramSectionJson | null));
    if (typeof next === "string") return { error: next };
    // hiddenPosts lama tidak dipakai lagi setelah daftar post tersimpan.
    const apply = (json: unknown) => {
      const rest = { ...((json ?? {}) as InstagramSectionJson) };
      delete rest.hiddenPosts;
      return { ...rest, posts: next };
    };
    const { data: updated, error } = await supabase
      .from("content_sections")
      .update({ draft: apply(row.draft), published: apply(row.published), updated_at: new Date().toISOString() })
      .eq("page", "home")
      .eq("key", "instagram")
      .eq("updated_at", row.updated_at)
      .select("key");
    if (error) return { error: `Gagal menyimpan: ${error.message}` };
    if (updated?.length) {
      refreshFeed();
      return { posts: next };
    }
  }
  return { error: "Post sedang diubah admin lain — muat ulang halaman lalu coba lagi." };
}

export async function setInstagramPostVisible(id: string, visible: boolean): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  let handle = "";
  const r = await writePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return "Post tidak ditemukan — muat ulang halaman.";
    handle = post.handle;
    return posts.map((p) => (p.id === id ? { ...p, visible } : p));
  });
  if ("error" in r) return fail(r.error);
  await audit(auth.userId, `${visible ? "menampilkan" : "menyembunyikan"} post ${handle}`, "content", "instagram");
  return done(visible ? `Post ${handle} tampil di homepage.` : `Post ${handle} disembunyikan dari homepage.`);
}

export type PostInput = {
  platform: PostPlatform;
  handle: string;
  text: string;
  href: string;
  image: string;
  /** Foto diambil otomatis dari link (boleh diganti saat link berubah) — bukan upload manual. */
  imageAuto: boolean;
  visible: boolean;
  memberId: string | null;
};

/** Tambah (id kosong) atau ubah post Instagram / TikTok / Threads. */
export async function saveInstagramPost(id: string, input: PostInput): Promise<ActionResult & { post?: StoredPost }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  if (!isPostPlatform(input.platform)) return fail("Pilih jenis post.");
  const handle = normalizeHandle(input.handle);
  if (!handle) return fail("Isi username akun (mis. @socialslay).");
  const text = input.text.trim();
  if (!text) return fail("Isi kutipan post.");
  if (text.length > 280) return fail("Kutipan maksimal 280 karakter.");
  const linkError = postLinkError(input.platform, input.href);
  if (linkError) return fail(linkError);
  // Hanya foto situs (/images/…) atau upload di bucket post — host lain tidak diizinkan next/image (feed publik error).
  if (input.image && !input.image.startsWith("/images/") && !isOwnUpload(POST_BUCKET, input.image)) return fail("Foto post tidak valid — upload ulang fotonya.");
  if (input.memberId && !(await findMemberById(input.memberId))) return fail("Member yang dihubungkan tidak ditemukan — pilih ulang.");

  // Satu-satunya tempat aturan foto per platform (Threads: kutipan saja) — pembaca percaya data tersimpan.
  const image = POST_PLATFORMS[input.platform].usesImage ? input.image || undefined : undefined;

  let saved: StoredPost | undefined;
  const r = await writePosts((posts) => {
    const before = posts.find((p) => p.id === id);
    if (id && !before) return "Post tidak ditemukan — muat ulang halaman.";
    saved = {
      ...before,
      id: before?.id ?? `post:${crypto.randomUUID()}`,
      platform: input.platform,
      handle,
      text,
      href: input.href.trim(),
      image,
      imagePosition: image && image === before?.image ? before?.imagePosition : undefined,
      imageAuto: Boolean(image) && input.imageAuto,
      visible: input.visible,
      memberId: input.memberId || null,
    };
    return before ? posts.map((p) => (p.id === id ? saved! : p)) : [...posts, saved];
  });
  if ("error" in r) return fail(r.error);
  await audit(auth.userId, `${id ? "mengubah" : "menambah"} post ${handle}`, "content", "instagram");
  return { ...done(id ? `Post ${handle} tersimpan.` : `Post ${handle} ditambahkan.`), post: saved };
}

export async function deleteInstagramPost(id: string): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  let handle = "";
  let image: string | undefined;
  const r = await writePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return "Post tidak ditemukan — muat ulang halaman.";
    handle = post.handle;
    image = post.image;
    return posts.filter((p) => p.id !== id);
  });
  if ("error" in r) return fail(r.error);
  // Foto upload post ini ikut dihapus dari Storage bila tidak dipakai post lain.
  if (image && !r.posts.some((p) => p.image === image)) await removeOwnUploads(POST_BUCKET, [image]);
  await audit(auth.userId, `menghapus post ${handle}`, "content", "instagram");
  return done(`Post ${handle} dihapus.`);
}

const POST_BUCKET = "community-posts";
const MAX_POST_IMAGE = 5 * 1024 * 1024;
const storePostImage = (file: FormDataEntryValue | null) => uploadPublicImage({ bucket: POST_BUCKET, file, folder: new Date().toISOString().slice(0, 7), maxBytes: MAX_POST_IMAGE });

// Foto preview link (og:image) hanya diambil dari domain ini — server tidak mengikuti URL sembarangan.
const PREVIEW_PAGE_HOSTS = ["instagram.com", "tiktok.com"];
const PREVIEW_IMAGE_HOSTS = ["cdninstagram.com", "fbcdn.net", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibyteimg.com", "byteimg.com"];
const hostIn = (url: string, hosts: string[]) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};
const decodeHtml = (v: string) => v.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').replace(/&#039;/g, "'");

/**
 * Ambil foto post dari link Instagram / TikTok (foto preview yang sama dengan saat link dibagikan di
 * WhatsApp), lalu simpan ke Storage — URL foto dari Instagram/TikTok kedaluwarsa dalam beberapa hari.
 * Bisa gagal (akun private, Instagram minta login, format halaman berubah) → admin upload manual.
 */
export async function fetchPostPhoto(platform: PostPlatform, href: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!POST_PLATFORMS[platform].usesImage) return { ok: false, error: `Post ${POST_PLATFORMS[platform].label} tidak memakai foto.` };
  if (postLinkError(platform, href)) return { ok: false, error: "Link belum valid." };
  const failed = { ok: false as const, error: `Foto tidak bisa diambil otomatis dari ${POST_PLATFORMS[platform].label} — upload foto manual.` };
  try {
    const page = await fetchAllowed(href.trim(), PREVIEW_PAGE_HOSTS, { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", Accept: "text/html" });
    // Dialihkan ke halaman login (akun private / Instagram minta login) → foto preview-nya hanya logo umum.
    if (!page?.ok || /^\/(accounts\/)?login/i.test(new URL(page.url).pathname)) return failed;
    // og:image ada di <head> — cukup baca 2 MB pertama.
    const html = new TextDecoder().decode(await readCapped(page, 2 * 1024 * 1024, true));
    const meta = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    const imageUrl = meta ? decodeHtml(meta[1]) : "";
    // static.cdninstagram.com / static.tiktok… = aset umum situs (logo), bukan foto post.
    if (!imageUrl || /^https:\/\/static\./i.test(imageUrl)) return failed;

    const img = await fetchAllowed(imageUrl, PREVIEW_IMAGE_HOSTS);
    const type = (img?.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!img?.ok || !IMAGE_TYPES[type]) return failed;
    const bytes = await readCapped(img, MAX_POST_IMAGE);
    if (!bytes.byteLength) return failed;
    const result = await storePostImage(new File([bytes], `preview.${IMAGE_TYPES[type]}`, { type }));
    if (!result.ok) return { ok: false, error: result.error };
    await audit(auth.userId, `mengambil foto post ${POST_PLATFORMS[platform].label} dari link`, "post_image", result.path);
    return { ok: true, url: result.url };
  } catch {
    return failed;
  }
}

/**
 * fetch yang mengikuti redirect sendiri (maks 3) dan memeriksa domain di SETIAP langkah — server
 * tidak pernah meminta halaman di luar daftar, termasuk lewat redirect.
 */
async function fetchAllowed(url: string, hosts: string[], headers?: Record<string, string>): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (!hostIn(current, hosts)) return null;
    const res = await fetch(current, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel();
    current = new URL(location, current).toString();
  }
  return null;
}

/**
 * Baca body maksimal `max` byte tanpa memuat seluruh respons ke memori. Lebih dari itu: `truncate`
 * → kembalikan `max` byte pertama (HTML), selain itu → kosong (gambar terlalu besar).
 */
async function readCapped(res: Response, max: number, truncate = false): Promise<Uint8Array<ArrayBuffer>> {
  if (!truncate && Number(res.headers.get("content-length") ?? 0) > max) {
    await res.body?.cancel();
    return new Uint8Array();
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    if (size + value.byteLength > max) {
      await reader.cancel();
      if (!truncate) return new Uint8Array();
      chunks.push(value.subarray(0, max - size));
      size = max;
      break;
    }
    size += value.byteLength;
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Buang foto post yang diupload / diambil otomatis tapi tidak jadi dipakai (diganti atau dibatalkan). */
export async function discardPostImages(urls: string[]): Promise<void> {
  const auth = await requireEditor("content");
  if ("error" in auth || !urls.length) return;
  const used = new Set(postsFromSection(await readInstagramSection(await createSupabaseServerClient())).map((p) => p.image));
  await removeOwnUploads(POST_BUCKET, urls.filter((u) => !used.has(u)));
}

/** Upload foto post ke Storage; URL tersimpan saat admin menekan Simpan. */
export async function uploadPostImage(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return { ok: false, error: auth.error };
  const result = await storePostImage(formData.get("file"));
  if (!result.ok) return result;
  await audit(auth.userId, "mengupload foto post", "post_image", result.path);
  return { ok: true, url: result.url };
}
