/**
 * Post Instagram, TikTok & Threads di feed "See You on the Court!" (homepage, Activity, Shop).
 * Modul ini aman untuk browser (tanpa konten statis) — daftar tersimpan & fallback statis ada di
 * server/community-posts.ts.
 */

/** Satu tabel platform: daftar pilihan, label, dan apakah post memakai foto. */
export const POST_PLATFORMS = {
  instagram: { label: "Instagram", usesImage: true, linkLabel: "Link post Instagram", placeholder: "https://www.instagram.com/p/…" },
  tiktok: { label: "TikTok", usesImage: true, linkLabel: "Link video TikTok", placeholder: "https://www.tiktok.com/@user/video/…" },
  // Threads selalu kartu navy berisi kutipan — link hanya untuk membuka post-nya.
  threads: { label: "Threads", usesImage: false, linkLabel: "Link post Threads", placeholder: "https://www.threads.net/@user/post/…" },
} as const;

export type PostPlatform = keyof typeof POST_PLATFORMS;
export const POST_PLATFORM_KEYS = Object.keys(POST_PLATFORMS) as PostPlatform[];
export const isPostPlatform = (value: string): value is PostPlatform => value in POST_PLATFORMS;

export type StoredPost = {
  id: string;
  platform: PostPlatform;
  handle: string;
  text: string;
  href: string;
  image?: string;
  imagePosition?: string;
  /** Foto diambil otomatis dari link post (bukan upload manual). */
  imageAuto?: boolean;
  visible: boolean;
  /** Member Soslay pemilik post (opsional). */
  memberId?: string | null;
};

export type InstagramSectionJson = { posts?: StoredPost[]; hiddenPosts?: string[] } & Record<string, unknown>;

/** Link post sesuai platform: instagram.com/p|reel/…, tiktok.com/@user/video/… (atau vt/vm), threads.net|com/@user/post/…. */
export function postLinkError(platform: PostPlatform, href: string): string | null {
  const url = href.trim();
  if (!url) return `Tempel ${POST_PLATFORMS[platform].linkLabel.replace(/^Link/, "link")}.`;
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
  if (platform === "threads") {
    return (host === "threads.net" || host === "threads.com") && /^\/@[\w.]+\/post\/[\w-]+/.test(parsed.pathname) ? null : "Link harus post Threads, mis. https://www.threads.net/@user/post/…";
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
