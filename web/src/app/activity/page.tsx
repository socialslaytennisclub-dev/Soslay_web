import type { Metadata } from "next";
import { ActivityHero } from "@/components/activity/ActivityHero/ActivityHero";
import { SessionsSection } from "@/components/activity/SessionsSection/SessionsSection";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { activityPage, isActivityType, sessions } from "@/content/activity";
import { instagram } from "@/content/home";
import { filterByType, pastSessions, pickFeatured, upcomingSessions } from "@/lib/sessions";

export const metadata: Metadata = {
  title: "Activity — SOSLAY",
  description: "Jadwal mabar, match day, coaching, dan tennis escape Soslay di Jakarta & Bali.",
};

/** Halaman Activity (Figma 25:493). Hanya menyusun data + section. */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const { type } = await searchParams;
  const activeType = isActivityType(type) ? type : undefined;

  const now = new Date();
  const upcoming = upcomingSessions(sessions, now);
  const featured = pickFeatured(upcoming);
  // Sesi unggulan sudah tampil di hero → tidak diulang di grid.
  const listed = filterByType(upcoming, activeType).filter((session) => session !== featured);
  const past = filterByType(pastSessions(sessions, now), activeType).slice(0, activityPage.past.limit);

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          {featured && <ActivityHero session={featured} />}
          <SessionsSection upcoming={listed} past={past} activeType={activeType} />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
