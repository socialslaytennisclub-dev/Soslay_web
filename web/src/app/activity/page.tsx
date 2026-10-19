import type { Metadata } from "next";
import { ActivityHero } from "@/components/activity/ActivityHero/ActivityHero";
import { ActivityTypeFilter } from "@/components/activity/ActivityTypeFilter/ActivityTypeFilter";
import { SessionsSection } from "@/components/activity/SessionsSection/SessionsSection";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { activityPage, isActivityType } from "@/content/activity";
import { instagram } from "@/content/home";
import { filterByType, newestFirst, pastSessions, pickFeatured, upcomingSessions } from "@/lib/sessions";
import { getWebsiteSessions } from "@/server/public/sessions";

export const metadata: Metadata = {
  title: "Activity — SOSLAY",
  description: "Soslay mabar, match day, coaching, and tennis escape schedules in Jakarta & Bali.",
};

/** Halaman Activity (Figma 25:493). Hanya menyusun data + section. */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const { type } = await searchParams;
  const activeType = isActivityType(type) ? type : undefined;

  const sessions = await getWebsiteSessions();
  const now = new Date();
  const upcoming = upcomingSessions(sessions, now);
  const featured = pickFeatured(upcoming);
  // Sesi unggulan sudah tampil di hero → tidak diulang di grid.
  const listed = newestFirst(filterByType(upcoming, activeType).filter((session) => session !== featured));
  const past = filterByType(pastSessions(sessions, now), activeType).slice(0, activityPage.past.limit);

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          {featured && <ActivityHero session={featured} />}
          <SessionsSection upcoming={listed} past={past} filter={<ActivityTypeFilter activeType={activeType} />} />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
