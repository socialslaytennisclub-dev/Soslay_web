/** Link video pendek 9:16 untuk testimoni (Figma admin 09f): Instagram Reels, TikTok, YouTube Shorts. */

export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "upload";

export const VIDEO_PLATFORM_LABEL: Record<VideoPlatform, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  upload: "Video upload",
};

const PATTERNS: { platform: Exclude<VideoPlatform, "upload">; test: RegExp }[] = [
  { platform: "instagram", test: /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[\w-]+/i },
  { platform: "tiktok", test: /^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/(@[\w.-]+\/video\/\d+|[\w-]+)/i },
  { platform: "youtube", test: /^https:\/\/(www\.|m\.)?(youtube\.com\/shorts\/[\w-]+|youtu\.be\/[\w-]+)/i },
];

/** URL → platform, atau null bila bukan link video pendek yang didukung. */
export function detectVideoPlatform(url: string): Exclude<VideoPlatform, "upload"> | null {
  const value = url.trim();
  return PATTERNS.find((p) => p.test.test(value))?.platform ?? null;
}

/** 42 → "0:42". */
export function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
