"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeHandle, postLinkError, postsFromSection, type InstagramSectionJson, type PostPlatform, type StoredPost } from "@/lib/community-posts";
import { detectVideoPlatform } from "@/lib/video";
import { uploadPublicImage } from "../../storage";
import type { AdminTestimonial, ContentSection } from "../types";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Konten & Galeri → homepage website (content_sections, testimonials). */

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
  // Post Instagram & Threads (posts / hiddenPosts lama) dikelola terpisah — pertahankan dari versi tersimpan.
  const { data: current } = await supabase.from("content_sections").select("key, published").eq("page", "home");
  const postsByKey = new Map(
    (current ?? []).map((r) => {
      const json = (r.published ?? {}) as InstagramSectionJson;
      return [r.key as string, { ...(json.posts ? { posts: json.posts } : {}), ...(json.hiddenPosts ? { hiddenPosts: json.hiddenPosts } : {}) }];
    }),
  );
  const now = new Date().toISOString();

  const rows = sections.map((s, i) => {
    const body = { title: s.title.trim(), description: s.description.trim(), cta: s.cta ?? null, image: s.image ?? null, overlay: s.overlay ?? null, ...postsByKey.get(s.key) };
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

/** Post Instagram/Threads berasal dari konten statis; yang disembunyikan dicatat di section "instagram". */
/** Baca daftar post (atau konten statis), ubah, lalu simpan ke draft & published section Instagram. */
async function writePosts(change: (posts: StoredPost[]) => StoredPost[] | string): Promise<{ error: string } | { posts: StoredPost[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: row, error: readError } = await supabase.from("content_sections").select("draft, published").eq("page", "home").eq("key", "instagram").maybeSingle();
  if (readError || !row) return { error: "Section Instagram belum ada — publikasikan homepage sekali dulu." };
  const next = change(postsFromSection(row.published as InstagramSectionJson | null));
  if (typeof next === "string") return { error: next };
  const apply = (json: unknown) => {
    const { hiddenPosts: _old, ...rest } = (json ?? {}) as InstagramSectionJson;
    void _old;
    return { ...rest, posts: next };
  };
  const { error } = await supabase.from("content_sections").update({ draft: apply(row.draft), published: apply(row.published) }).eq("page", "home").eq("key", "instagram");
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
  refreshPaths("/", "/admin/konten");
  return { posts: next };
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

export type PostInput = { platform: PostPlatform; handle: string; text: string; href: string; image: string; visible: boolean; memberId: string | null };

/** Tambah (id kosong) atau ubah post Instagram / TikTok / Threads. */
export async function saveInstagramPost(id: string, input: PostInput): Promise<ActionResult & { post?: StoredPost }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  if (!["instagram", "tiktok", "threads"].includes(input.platform)) return fail("Pilih jenis post.");
  const handle = normalizeHandle(input.handle);
  if (!handle) return fail("Isi username akun (mis. @socialslay).");
  const text = input.text.trim();
  if (!text) return fail("Isi kutipan post.");
  if (text.length > 280) return fail("Kutipan maksimal 280 karakter.");
  const linkError = postLinkError(input.platform, input.href);
  if (linkError) return fail(linkError);
  if (input.image && !/^(\/images\/|https:\/\/)/.test(input.image)) return fail("Foto post tidak valid.");

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
      // Threads selalu kartu navy berisi kutipan (tanpa foto); IG / TikTok tanpa foto juga begitu.
      image: input.platform === "threads" ? undefined : input.image || undefined,
      imagePosition: input.platform !== "threads" && input.image && input.image === before?.image ? before?.imagePosition : undefined,
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
  const r = await writePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return "Post tidak ditemukan — muat ulang halaman.";
    handle = post.handle;
    return posts.filter((p) => p.id !== id);
  });
  if ("error" in r) return fail(r.error);
  await audit(auth.userId, `menghapus post ${handle}`, "content", "instagram");
  return done(`Post ${handle} dihapus.`);
}

const POST_BUCKET = "community-posts";

// Foto preview link (og:image) hanya diambil dari domain ini — server tidak mengikuti URL sembarangan.
const PREVIEW_PAGE_HOSTS = ["instagram.com", "tiktok.com"];
const PREVIEW_IMAGE_HOSTS = ["cdninstagram.com", "fbcdn.net", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibyteimg.com", "byteimg.com"];
const PLATFORM_LABEL: Record<PostPlatform, string> = { instagram: "Instagram", tiktok: "TikTok", threads: "Threads" };
const PREVIEW_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
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
  if (platform === "threads") return { ok: false, error: "Post Threads tidak memakai foto." };
  if (postLinkError(platform, href)) return { ok: false, error: "Link belum valid." };
  const failed = { ok: false as const, error: `Foto tidak bisa diambil otomatis dari ${PLATFORM_LABEL[platform]} — upload foto manual.` };
  try {
    const page = await fetch(href.trim(), {
      headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    // Link pendek (vt.tiktok.com) diarahkan ulang — hasil akhirnya tetap harus di domain yang sama.
    if (!page.ok || !hostIn(page.url, PREVIEW_PAGE_HOSTS)) return failed;
    const html = (await page.text()).slice(0, 2_000_000);
    const meta = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    const imageUrl = meta ? decodeHtml(meta[1]) : "";
    if (!imageUrl || !hostIn(imageUrl, PREVIEW_IMAGE_HOSTS)) return failed;

    const img = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    const type = (img.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!img.ok || !PREVIEW_TYPES[type]) return failed;
    const bytes = await img.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) return failed;
    const file = new File([bytes], `preview.${PREVIEW_TYPES[type]}`, { type });
    const result = await uploadPublicImage({ bucket: POST_BUCKET, file, folder: new Date().toISOString().slice(0, 7), maxBytes: 5 * 1024 * 1024 });
    if (!result.ok) return { ok: false, error: result.error };
    await audit(auth.userId, "content.post_image_fetch", "post_image", result.path);
    return { ok: true, url: result.url };
  } catch {
    return failed;
  }
}

/** Upload foto post ke Storage; URL tersimpan saat admin menekan Simpan. */
export async function uploadPostImage(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireEditor("content");
  if ("error" in auth) return { ok: false, error: auth.error };
  const result = await uploadPublicImage({ bucket: POST_BUCKET, file: formData.get("file"), folder: new Date().toISOString().slice(0, 7), maxBytes: 5 * 1024 * 1024 });
  if (!result.ok) return result;
  await audit(auth.userId, "content.post_image_upload", "post_image", result.path);
  return { ok: true, url: result.url };
}
