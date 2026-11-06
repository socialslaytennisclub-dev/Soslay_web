import { instagram } from "@/content/home";

/**
 * Post Instagram & TikTok di feed "See You on the Court!" homepage. Disimpan di
 * content_sections (page home, key instagram) → `posts`. Selama belum pernah diedit di admin,
 * daftar diambil dari konten statis (content/home) + `hiddenPosts` lama.
 */
export type PostPlatform = "instagram" | "tiktok";

export type StoredPost = {
  id: string;
  /** "threads" = post lama sebelum Threads diganti TikTok — tetap tampil, diedit jadi IG / TikTok. */
  platform: PostPlatform | "threads";
  handle: string;
  text: string;
  href: string;
  image?: string;
  imagePosition?: string;
  visible: boolean;
  /** Member Soslay pemilik post (opsional). */
  memberId?: string | null;
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

/** Link post sesuai platform: instagram.com/p|reel/… atau tiktok.com/@user/video/… (atau link pendek vt/vm). */
export function postLinkError(platform: PostPlatform, href: string): string | null {
  const url = href.trim();
  if (!url) return platform === "instagram" ? "Tempel link post Instagram." : "Tempel link video TikTok.";
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
  const full = (host === "tiktok.com" || host === "m.tiktok.com") && /^\/@[\w.-]+\/(video|photo)\/\d+/.test(parsed.pathname);
  const short = (host === "vt.tiktok.com" || host === "vm.tiktok.com") && /^\/\w+/.test(parsed.pathname);
  return full || short ? null : "Link harus video TikTok, mis. https://www.tiktok.com/@user/video/…";
}

/** "@user" dari isian admin ("user", "@user", "instagram.com/user"). */
export function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/^@+/, "").replace(/\/.*$/, "");
  return h ? `@${h}` : "";
}
