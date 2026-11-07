import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { instagram } from "@/content/home";
import type { InstagramSectionJson, StoredPost } from "@/lib/community-posts";

/**
 * Daftar post tersimpan di content_sections (page home, key instagram) → `posts`. Selama belum
 * pernah diedit di admin: konten statis (content/home) + `hiddenPosts` lama.
 */
export function postsFromSection(json: InstagramSectionJson | null | undefined): StoredPost[] {
  if (Array.isArray(json?.posts)) return json.posts;
  const hidden = new Set(json?.hiddenPosts ?? []);
  return instagram.posts.map((p) => ({
    id: `ig:${p.handle}`,
    platform: p.platform,
    handle: p.handle,
    text: p.text.join(" "),
    href: p.href,
    image: "image" in p ? p.image : undefined,
    imagePosition: "imagePosition" in p ? p.imagePosition : undefined,
    visible: !hidden.has(p.handle),
  }));
}

/** Baca JSON published section Instagram (dipakai feed publik, admin, & pembersihan foto). */
export async function readInstagramSection(client: SupabaseClient): Promise<InstagramSectionJson | null> {
  const { data } = await client.from("content_sections").select("published").eq("page", "home").eq("key", "instagram").maybeSingle();
  return (data?.published as InstagramSectionJson | null) ?? null;
}
