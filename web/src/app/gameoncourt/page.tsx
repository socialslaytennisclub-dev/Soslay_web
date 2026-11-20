import type { Metadata } from "next";
import { SlayTennis } from "@/components/game/SlayTennis/SlayTennis";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";

export const metadata: Metadata = {
  title: "Slay Tennis — SOSLAY",
  description: "Soslay's tennis mini game: rally against the Slaymericano ghost or play a member one on one by link.",
};

/** Mini-game Slay Tennis (lawan komputer / lawan member lewat link). Sepenuhnya di sisi klien. */
export default function TennisPage() {
  return (
    <>
      <Navbar variant="solid" />
      <MotionProvider>
        <main>
          <SlayTennis />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
