import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MemberHeader } from "@/components/member/MemberHeader/MemberHeader";
import { MemberTabs } from "@/components/member/MemberTabs/MemberTabs";
import { MotionProvider } from "@/components/motion/MotionProvider";

export const metadata: Metadata = {
  title: "Akun — SOSLAY",
  // Area member bersifat pribadi.
  robots: { index: false, follow: false },
};

/** Member area (Figma 25:2601 dkk.) — header & tab dipakai bersama semua tab. */
export default function MemberLayout({ children }: LayoutProps<"/akun">) {
  return (
    <>
      <Navbar variant="solid" />
      <MotionProvider>
        <main>
          <MemberHeader />
          <MemberTabs />
          {children}
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
