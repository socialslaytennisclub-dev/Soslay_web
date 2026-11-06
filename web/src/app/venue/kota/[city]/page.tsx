import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenuePageContent } from "@/components/venue/VenueDirectory/VenuePageContent";
import { cityHref, isCitySlug, venueCities } from "@/content/venues";

/**
 * Halaman Venue terfilter per kota, statis + ISR. Pengunjung membukanya lewat /venue?city=bali
 * (rewrite di next.config, URL tidak berubah) — HTML awal langsung berisi venue kota itu saja.
 */
export function generateStaticParams() {
  return venueCities.map(({ slug }) => ({ city: slug }));
}

export const dynamicParams = false;
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/venue/kota/[city]">): Promise<Metadata> {
  const slug = (await params).city;
  const city = venueCities.find((c) => c.slug === slug);
  if (!city) return {};
  return {
    title: `Venue ${city.label} — SOSLAY`,
    description: `Soslay's curated tennis courts in ${city.label}.`,
    alternates: { canonical: cityHref(city.slug) },
  };
}

export default async function VenueCityPage({ params }: PageProps<"/venue/kota/[city]">) {
  const { city } = await params;
  if (!isCitySlug(city)) notFound();
  return <VenuePageContent initialCity={city} />;
}
