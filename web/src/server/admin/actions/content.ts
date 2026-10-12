"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContentSection } from "../types";
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
  // hiddenPosts (Instagram) dikelola terpisah — pertahankan dari versi tersimpan.
  const { data: current } = await supabase.from("content_sections").select("key, published").eq("page", "home");
  const hiddenByKey = new Map((current ?? []).map((r) => [r.key as string, (r.published as { hiddenPosts?: string[] } | null)?.hiddenPosts]));
  const now = new Date().toISOString();

  const rows = sections.map((s, i) => {
    const body = { title: s.title.trim(), description: s.description.trim(), cta: s.cta ?? null, image: s.image ?? null, overlay: s.overlay ?? null, ...(hiddenByKey.get(s.key) ? { hiddenPosts: hiddenByKey.get(s.key) } : {}) };
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

/** Post Instagram/Threads berasal dari konten statis; yang disembunyikan dicatat di section "instagram". */
export async function setInstagramPostVisible(handle: string, visible: boolean): Promise<ActionResult> {
  const auth = await requireEditor("content");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const { data: row, error: readError } = await supabase.from("content_sections").select("draft, published").eq("page", "home").eq("key", "instagram").maybeSingle();
  if (readError || !row) return fail("Section Instagram belum ada — publikasikan homepage sekali dulu.");

  const update = (json: unknown) => {
    const body = (json ?? {}) as { hiddenPosts?: string[] };
    const hidden = new Set(body.hiddenPosts ?? []);
    if (visible) hidden.delete(handle);
    else hidden.add(handle);
    return { ...body, hiddenPosts: [...hidden] };
  };
  const { error } = await supabase.from("content_sections").update({ draft: update(row.draft), published: update(row.published) }).eq("page", "home").eq("key", "instagram");
  if (error) return fail(`Gagal mengubah: ${error.message}`);
  await audit(auth.userId, `${visible ? "menampilkan" : "menyembunyikan"} post ${handle}`, "content", "instagram");
  refreshPaths("/", "/admin/konten");
  return done(visible ? `Post ${handle} tampil di homepage.` : `Post ${handle} disembunyikan dari homepage.`);
}
