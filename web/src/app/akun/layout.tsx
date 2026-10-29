import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { RefreshOnFocus } from "@/components/member/RefreshOnFocus";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { getMyMember } from "@/server/member/profile";

export const metadata: Metadata = {
  title: "Akun — SOSLAY",
  // Area member bersifat pribadi.
  robots: { index: false, follow: false },
};

/** Member area — navbar & footer untuk semua halaman /akun (tab member & detail sesi). */
export default async function MemberLayout({ children }: LayoutProps<"/akun">) {
  const me = await getMyMember();
  return (
    <>
      <Navbar variant="solid" member={me && { name: me.profile.displayName || me.header.name, photo: me.header.photo }} />
      <RefreshOnFocus />
      <MotionProvider>
        <main>{children}</main>
        <Footer />
      </MotionProvider>
    </>
  );
}
