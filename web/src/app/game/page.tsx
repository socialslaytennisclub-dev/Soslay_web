import type { Metadata } from "next";
import { SlayRally } from "@/components/game/SlayRally/SlayRally";
import { SplashScreen } from "@/components/home/SplashScreen/SplashScreen";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";

export const metadata: Metadata = {
  title: "Slay Rally — SOSLAY",
  description: "Soslay's tennis mini game: keep the rally alive, clear the court, and beat your best score.",
};

/** Halaman mini-game Slay Rally. Sepenuhnya di sisi klien — tanpa data server. */
export default function GamePage() {
  return (
    <>
      {/* Onboarding sama dengan homepage — penandanya dipasang SPLASH_SCRIPT (SPLASH_PATHS) di root layout. */}
      <SplashScreen />
      <Navbar variant="solid" />
      <MotionProvider>
        <main>
          <SlayRally />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
