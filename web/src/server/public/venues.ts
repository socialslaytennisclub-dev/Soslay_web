import "server-only";
import { cache } from "react";
import { venueList, type Venue } from "@/content/venues";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { websiteRegion } from "@/lib/venue-options";

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
  court_color: string | null;
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
    .select("slug, name, city, area, venue_type, tagline, court_color, description, cover_path, hero_path, show_on_homepage")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error || !data) {
    console.error("[venues] gagal memuat dari Supabase:", error?.message);
    // Foto hero hanya dari master — saat master tak terbaca, detail venue memakai foto cover.
    return fallback.map((v) => ({ ...v, heroImage: undefined }));
  }

  return (data as Row[])
    // Website baru punya wilayah Jakarta (Jabodetabek) & Bali — kota venue dipetakan ke wilayahnya.
    .flatMap((v) => {
      const region = websiteRegion(v.city);
      return region ? [{ ...v, cityName: v.city, city: region }] : [];
    })
    .map((v) => {
      const content = venueList.find((c) => c.slug === v.slug);
      return {
        slug: v.slug,
        name: v.name,
        city: v.city,
        cityName: v.cityName,
        courtColor: v.court_color ?? undefined,
        type: v.venue_type ?? "",
        image: v.cover_path ?? content?.image ?? "/images/home/venue-common-grounds.webp",
        imagePosition: content?.imagePosition ?? "50% 50%",
        tagline: v.tagline ?? "",
        description: v.description ?? "",
        // Foto hero hanya dari master (admin Venues); kosong → pakai foto cover master.
        heroImage: v.hero_path ?? undefined,
        area: v.area ?? content?.area,
        showOnHomepage: v.show_on_homepage,
      };
    });
});

export async function findWebsiteVenue(slug: string) {
  return (await getWebsiteVenues()).find((v) => v.slug === slug);
}
