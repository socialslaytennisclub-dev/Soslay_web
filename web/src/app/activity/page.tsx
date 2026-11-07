import type { Metadata } from "next";
import { ActivityHero } from "@/components/activity/ActivityHero/ActivityHero";
import { ActivityTypeFilter } from "@/components/activity/ActivityTypeFilter/ActivityTypeFilter";
import { SessionsSection } from "@/components/activity/SessionsSection/SessionsSection";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { activityPage } from "@/content/activity";
import { newestFirst, pastSessions, pickFeatured, upcomingSessions } from "@/lib/sessions";
import { getWebsiteSessions } from "@/server/public/sessions";
import { getInstagramFeed } from "@/server/public/homepage";

export const metadata: Metadata = {
  title: "Activity — SOSLAY",
  description: "Soslay mabar, match day, coaching, and tennis escape schedules in Jakarta & Bali.",
};

/**
 * Statis + ISR (bukan render per request) supaya pindah halaman cepat dari cache Vercel. Jadwal
 * dihitung dari jam sekarang → render ulang tiap menit (dan saat admin menyimpan sesi atau trip).
 */
export const revalidate = 60;

/**
 * Halaman Activity (Figma 25:493). Hanya menyusun data + section. Filter per tipe ada di halaman
 * /activity/[type]; link lama /activity?type=… dialihkan ke sana (next.config).
 */
export default async function ActivityPage() {
  const [sessions, feed] = await Promise.all([getWebsiteSessions(), getInstagramFeed()]);
  const now = new Date();
  const upcoming = upcomingSessions(sessions, now);
  const featured = pickFeatured(upcoming);
  // Sesi unggulan sudah tampil di hero → tidak diulang di grid.
  const listed = newestFirst(upcoming.filter((session) => session !== featured));
  const past = pastSessions(sessions, now).slice(0, activityPage.past.limit);

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          {featured && <ActivityHero session={featured} />}
          <SessionsSection
            upcoming={listed}
            past={past}
            filter={<ActivityTypeFilter />}
            featuredShown={!!featured}
          />
          <InstagramFeed {...feed} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
