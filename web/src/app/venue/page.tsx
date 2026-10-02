import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { VenueDirectory } from "@/components/venue/VenueDirectory/VenueDirectory";
import { isCitySlug, venueCities, venueList, venuePage } from "@/content/venues";

export const metadata: Metadata = {
  title: "Venue — SOSLAY",
  description: "Lapangan tenis pilihan Soslay di Jakarta & Bali — indoor, rooftop, outdoor, sampai tropical.",
};

/** Halaman Venue (Figma 25:749). Filter kota lewat ?city=jakarta | bali. */
export default async function VenuePage({ searchParams }: PageProps<"/venue">) {
  const { city } = await searchParams;
  const activeCity = isCitySlug(city) ? city : undefined;
  const cityName = venueCities.find((item) => item.slug === activeCity)?.city;
  const venues = cityName ? venueList.filter((venue) => venue.city === cityName) : venueList;

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero id="venue-hero-title" {...venuePage.hero} />
          <VenueDirectory venues={venues} activeCity={activeCity} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
