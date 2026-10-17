import "server-only";
import { cache } from "react";
import * as home from "@/content/home";
import { productCardProps } from "@/content/products";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getShopCatalog } from "./products";
import { getWebsiteVenues } from "./venues";

/**
 * Isi homepage = versi "published" dari admin (Konten & Galeri) di atas konten statis.
 * Section nonaktif tidak dirender; urutan mengikuti admin. Tanpa Supabase: konten statis.
 */

export type HomeSectionKey = "hero" | "activities" | "stats" | "venues" | "community" | "marquee" | "shop" | "instagram" | "promo";

type SectionJson = {
  title?: string;
  description?: string;
  cta?: { label: string; href: string } | null;
  image?: string | null;
  overlay?: boolean | null;
  /** Section Instagram: handle post yang disembunyikan. */
  hiddenPosts?: string[];
};

export type Homepage = {
  order: HomeSectionKey[];
  hero: typeof home.hero & { overlay?: boolean };
  activities: typeof home.activities;
  stats: typeof home.stats;
  venues: typeof home.venues;
  community: typeof home.community;
  marquee: string;
  shop: typeof home.shop;
  instagram: typeof home.instagram;
};

const DEFAULT_ORDER: HomeSectionKey[] = ["hero", "activities", "stats", "venues", "community", "marquee", "shop", "instagram"];

function staticHomepage(): Homepage {
  return {
    order: DEFAULT_ORDER,
    hero: home.hero,
    activities: home.activities,
    stats: home.stats,
    venues: home.venues,
    community: home.community,
    marquee: home.marquee.text,
    shop: home.shop,
    instagram: home.instagram,
  };
}

/** "Kalimat satu. Kalimat dua" → 2 baris (desain hero memakai 2 baris). */
function toLines(text: string): string[] {
  if (text.includes("\n")) return text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cut = text.indexOf(". ");
  return cut > 0 ? [text.slice(0, cut + 1), text.slice(cut + 2)] : [text];
}

/** "500+ Active Members" → nilai + label; ikon mengikuti urutan konten statis. */
function toStats(text: string): typeof home.stats {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [value, ...rest] = line.split(" ");
      return { value, label: rest.join(" "), icon: home.stats[i % home.stats.length].icon };
    });
}

export const getHomepage = cache(async (): Promise<Homepage> => {
  const base = staticHomepage();
  if (!isSupabaseConfigured) return base;

  const client = createSupabasePublicClient();
  const [{ data: rows, error }, { data: testimonials }, venues, catalog] = await Promise.all([
    client.from("content_sections").select("key, published, is_enabled, sort_order").eq("page", "home").order("sort_order"),
    client.from("testimonials").select("author_name, author_handle, quote, avatar_path, kind, video_url, video_platform").eq("is_published", true).order("sort_order"),
    getWebsiteVenues(),
    getShopCatalog(),
  ]);
  if (error || !rows?.length) {
    if (error) console.error("[homepage] gagal memuat dari Supabase:", error.message);
    return base;
  }

  const get = (key: HomeSectionKey) => (rows.find((r) => r.key === key)?.published ?? {}) as SectionJson;
  const hero = get("hero");
  const activities = get("activities");
  const stats = get("stats");
  const venuesSection = get("venues");
  const community = get("community");
  const marquee = get("marquee");
  const shop = get("shop");
  const instagram = get("instagram");
  const hidden = new Set(instagram.hiddenPosts ?? []);

  return {
    order: rows.filter((r) => r.is_enabled).map((r) => r.key as HomeSectionKey),
    hero: {
      ...base.hero,
      title: hero.title || base.hero.title,
      description: hero.description ? toLines(hero.description) : base.hero.description,
      cta: hero.cta ?? base.hero.cta,
      image: { ...base.hero.image, src: hero.image || base.hero.image.src },
      overlay: hero.overlay ?? true,
    },
    activities: { ...base.activities, title: activities.title || base.activities.title, description: activities.description ?? base.activities.description, cta: activities.cta ?? base.activities.cta },
    stats: stats.description ? toStats(stats.description) : base.stats,
    venues: {
      ...base.venues,
      title: venuesSection.title || base.venues.title,
      description: venuesSection.description ?? base.venues.description,
      cta: venuesSection.cta ?? base.venues.cta,
      items: venues.filter((v) => v.showOnHomepage),
    },
    community: {
      ...base.community,
      title: community.title ? (community.title.includes("\n") ? community.title.split("\n") : base.community.title.join(" ") === community.title ? base.community.title : [community.title]) : base.community.title,
      description: community.description ?? base.community.description,
      cta: community.cta ?? base.community.cta,
      testimonials: (testimonials?.length
        ? testimonials.map((t) => ({
            quote: t.quote as string,
            name: (t.author_handle as string | null) ?? (t.author_name as string),
            avatar: (t.avatar_path as string | null) ?? undefined,
            video: t.kind === "video" && t.video_url ? { url: t.video_url as string, platform: (t.video_platform as string | null) ?? "instagram" } : undefined,
          }))
        : base.community.testimonials) as typeof base.community.testimonials,
    },
    marquee: marquee.title || base.marquee,
    shop: {
      ...base.shop,
      title: shop.title || base.shop.title,
      description: shop.description ?? base.shop.description,
      cta: shop.cta ?? base.shop.cta,
      // Figma: 2 kartu unggulan (Best Seller teratas).
      products: catalog.products.filter((p) => p.featured).slice(0, 2).map((p) => productCardProps(p, catalog.details[p.slug])),
    },
    instagram: {
      ...base.instagram,
      title: instagram.title || base.instagram.title,
      description: instagram.description ?? base.instagram.description,
      cta: instagram.cta ?? base.instagram.cta,
      posts: base.instagram.posts.filter((p) => !hidden.has(p.handle)),
    },
  };
});
