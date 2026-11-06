import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { venuePage, type CitySlug } from "@/content/venues";
import { getWebsiteVenues } from "@/server/public/venues";
import { VenueDirectory } from "./VenueDirectory";

/**
 * Isi halaman Venue (Figma 25:749). Dipakai /venue (semua kota) dan /venue/kota/[city] — tujuan
 * rewrite /venue?city=… di next.config — jadi HTML statis per kota sudah terfilter.
 */
export async function VenuePageContent({ initialCity }: { initialCity?: CitySlug }) {
  const venues = await getWebsiteVenues();

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero id="venue-hero-title" {...venuePage.hero} />
          <VenueDirectory venues={venues} initialCity={initialCity} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
