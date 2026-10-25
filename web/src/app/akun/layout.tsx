import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";

export const metadata: Metadata = {
  title: "Akun — SOSLAY",
  // Area member bersifat pribadi.
  robots: { index: false, follow: false },
};

/** Member area — navbar & footer untuk semua halaman /akun (tab member & detail sesi). */
export default function MemberLayout({ children }: LayoutProps<"/akun">) {
  return (
    <>
      <Navbar variant="solid" />
      <MotionProvider>
        <main>{children}</main>
        <Footer />
      </MotionProvider>
    </>
  );
}
