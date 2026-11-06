import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { VenueDirectory } from "@/components/venue/VenueDirectory/VenueDirectory";
import { venuePage } from "@/content/venues";
import { getWebsiteVenues } from "@/server/public/venues";

export const metadata: Metadata = {
  title: "Venue — SOSLAY",
  description: "Soslay's curated tennis courts in Jakarta & Bali — indoor, rooftop, outdoor, and tropical.",
};

/** Statis + ISR (bukan render per request) supaya pindah halaman cepat dari cache Vercel. */
export const revalidate = 3600;

/** Halaman Venue (Figma 25:749). Filter kota ?city=jakarta | bali dijalankan di browser. */
export default async function VenuePage() {
  const venues = await getWebsiteVenues();

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero id="venue-hero-title" {...venuePage.hero} />
          <VenueDirectory venues={venues} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
