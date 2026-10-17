import type { ReactNode } from "react";
import { Activities, Community, Hero, Shop, Venues } from "@/components/home";
import { SplashScreen } from "@/components/home/SplashScreen/SplashScreen";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { Marquee } from "@/components/sections/Marquee/Marquee";
import { getHomepage, type HomeSectionKey } from "@/server/public/homepage";

/** Isi bisa diubah dari admin → render ulang paling lambat tiap 10 menit (dan saat admin mempublikasikan). */
export const revalidate = 600;

/**
 * Homepage — urutan & isi section mengikuti "Konten & Galeri" di admin (versi published).
 * Markup, style, logic & animasi tetap di masing-masing modul.
 */
export default async function HomePage() {
  const page = await getHomepage();
  const sections: Partial<Record<HomeSectionKey, ReactNode>> = {
    hero: <Hero key="hero" hero={page.hero} />,
    // Statistik tampil di dalam section Activities.
    activities: <Activities key="activities" activities={page.activities} stats={page.order.includes("stats") ? page.stats : []} />,
    venues: <Venues key="venues" venues={page.venues} />,
    community: <Community key="community" community={page.community} />,
    marquee: <Marquee key="marquee" text={page.marquee} />,
    shop: <Shop key="shop" shop={page.shop} />,
    instagram: <InstagramFeed key="instagram" {...page.instagram} />,
  };

  return (
    <>
      {/* Splash tiap load homepage — penandanya dipasang skrip beforeInteractive di root layout. */}
      <SplashScreen />
      {/* Navbar fixed harus di luar MotionProvider (ScrollSmoother men-transform kontennya) */}
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>{page.order.map((key) => sections[key])}</main>
        <Footer />
      </MotionProvider>
    </>
  );
}
