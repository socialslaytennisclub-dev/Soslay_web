import { instagram } from "@/content/home";

/**
 * Post Instagram & Threads di feed "See You on the Court!" homepage. Disimpan di
 * content_sections (page home, key instagram) → `posts`. Selama belum pernah diedit di admin,
 * daftar diambil dari konten statis (content/home) + `hiddenPosts` lama.
 */
export type PostPlatform = "instagram" | "threads";

export type StoredPost = {
  id: string;
  platform: PostPlatform;
  handle: string;
  text: string;
  href: string;
  image?: string;
  imagePosition?: string;
  visible: boolean;
};

export type InstagramSectionJson = { posts?: StoredPost[]; hiddenPosts?: string[] } & Record<string, unknown>;

/** Daftar post tersimpan, atau konten statis bila admin belum pernah mengedit. */
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

/** Link post sesuai platform: instagram.com/p|reel|tv/… atau threads.net|com/@user/post/…. */
export function postLinkError(platform: PostPlatform, href: string): string | null {
  const url = href.trim();
  if (!url) return platform === "instagram" ? "Tempel link post Instagram." : "Tempel link Threads.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Link tidak valid — salin langsung dari aplikasi (diawali https://).";
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (platform === "instagram") {
    return host === "instagram.com" && /^\/(p|reel|reels|tv)\/[\w-]+/.test(parsed.pathname) ? null : "Link harus post Instagram, mis. https://www.instagram.com/p/…";
  }
  return (host === "threads.net" || host === "threads.com") && /^\/@[\w.]+\/post\/[\w-]+/.test(parsed.pathname) ? null : "Link harus post Threads, mis. https://www.threads.net/@user/post/…";
}

/** "@user" dari isian admin ("user", "@user", "instagram.com/user"). */
export function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/^@+/, "").replace(/\/.*$/, "");
  return h ? `@${h}` : "";
}
