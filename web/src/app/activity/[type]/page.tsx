import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityAbout } from "@/components/activity/ActivityAbout/ActivityAbout";
import { SessionsSection } from "@/components/activity/SessionsSection/SessionsSection";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { activityLandings, activityPage } from "@/content/activity";
import { instagram } from "@/content/home";
import { filterByType, newestFirst, pastSessions, upcomingSessions } from "@/lib/sessions";
import { getWebsiteSessions } from "@/server/public/sessions";

export function generateStaticParams() {
  return activityLandings.map((landing) => ({ type: landing.path }));
}

export const dynamicParams = false;

/** Jadwal dihitung dari jam sekarang → render ulang tiap jam (dan saat admin menyimpan sesi). */
export const revalidate = 3600;

const findLanding = (path: string) => activityLandings.find((landing) => landing.path === path);

export async function generateMetadata({ params }: PageProps<"/activity/[type]">): Promise<Metadata> {
  const landing = findLanding((await params).type);
  if (!landing) return {};
  return { title: `${landing.wordmark} — SOSLAY`, description: landing.description };
}

/** Halaman per tipe aktivitas (Figma Website v2 347:2665 dkk.): hero wordmark + jadwal sesi tipe itu. */
export default async function ActivityTypePage({ params }: PageProps<"/activity/[type]">) {
  const landing = findLanding((await params).type);
  if (!landing) notFound();

  const sessions = await getWebsiteSessions();
  const now = new Date();
  const upcoming = newestFirst(filterByType(upcomingSessions(sessions, now), landing.type));
  const past = filterByType(pastSessions(sessions, now), landing.type).slice(0, activityPage.past.limit);

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero
            id="activity-type-title"
            wordmark={landing.wordmark}
            eyebrow="Soslay Activities"
            title={landing.title}
            highlight={landing.highlight}
            description={landing.description}
            cta={{ label: "See the schedule", href: "#jadwal" }}
            meta={[...landing.meta]}
            image={landing.image}
          />
          {"about" in landing && <ActivityAbout id="activity-about-title" {...landing.about} />}
          <SessionsSection upcoming={upcoming} past={past} activeType={landing.type} showFilter={false} />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
