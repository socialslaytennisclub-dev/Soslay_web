import "server-only";
import { cache } from "react";
import { venueList, type Venue } from "@/content/venues";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Venue untuk website (halaman Venue, detail, homepage). Dengan Supabase: venue aktif yang
 * dikelola di admin; crop foto (imagePosition) mengikuti konten statis bila slug-nya sama.
 */

type Row = {
  slug: string;
  name: string;
  city: string;
  venue_type: string | null;
  area: string | null;
  tagline: string | null;
  description: string | null;
  cover_path: string | null;
  hero_path: string | null;
  show_on_homepage: boolean;
};

export type WebsiteVenue = Venue & { showOnHomepage: boolean };

export const getWebsiteVenues = cache(async (): Promise<WebsiteVenue[]> => {
  const fallback = venueList.map((v) => ({ ...v, showOnHomepage: true }));
  if (!isSupabaseConfigured) return fallback;

  const { data, error } = await createSupabasePublicClient()
    .from("venues")
    .select("slug, name, city, area, venue_type, tagline, description, cover_path, hero_path, show_on_homepage")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error || !data) {
    console.error("[venues] gagal memuat dari Supabase:", error?.message);
    return fallback;
  }

  return (data as Row[])
    .filter((v) => v.city === "Jakarta" || v.city === "Bali")
    .map((v) => {
      const content = venueList.find((c) => c.slug === v.slug);
      return {
        slug: v.slug,
        name: v.name,
        city: v.city as Venue["city"],
        type: v.venue_type ?? "",
        image: v.cover_path ?? content?.image ?? "/images/home/venue-common-grounds.webp",
        imagePosition: content?.imagePosition ?? "50% 50%",
        tagline: v.tagline ?? "",
        description: v.description ?? "",
        heroImage: v.hero_path ?? content?.heroImage,
        area: v.area ?? content?.area,
        showOnHomepage: v.show_on_homepage,
      };
    });
});

export async function findWebsiteVenue(slug: string) {
  return (await getWebsiteVenues()).find((v) => v.slug === slug);
}
