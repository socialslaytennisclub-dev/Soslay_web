import { Activities, Community, Hero, Shop, Venues } from "@/components/home";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { Marquee } from "@/components/sections/Marquee/Marquee";
import { instagram } from "@/content/home";

/** Homepage — hanya menyusun section. Markup, style, logic & animasi ada di masing-masing modul. */
export default function HomePage() {
  return (
    <>
      {/* Navbar fixed harus di luar MotionProvider (ScrollSmoother men-transform kontennya) */}
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <Hero />
          <Activities />
          <Venues />
          <Community />
          <Marquee />
          <Shop />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
