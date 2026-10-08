import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { notFound } from "next/navigation";
import { GuideHero } from "@/components/guide/GuideHero";
import {
  BringSection,
  CourtVibeSection,
  OutfitSection,
  PhotoReferenceSection,
  QuickTipsSection,
} from "@/components/guide/GuideSections";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { findGuide, participantGuides } from "@/content/guides";
import { venueHref, findVenue } from "@/content/venues";

/** Tulisan tangan di kartu hero & panel Court Vibe (Figma: Caveat Bold) — hanya dimuat di halaman ini. */
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-caveat" });

/** Hanya venue yang punya panduan yang di-prerender; slug lain → 404. */
export function generateStaticParams() {
  return participantGuides.map((guide) => ({ slug: guide.venueSlug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/venue/[slug]/guide">): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) return {};
  return {
    title: `Participant Guide — ${guide.venueName} — SOSLAY`,
    description: guide.intro,
  };
}

/** Participant Guide per venue (Figma 151:52). */
export default async function ParticipantGuidePage({ params }: PageProps<"/venue/[slug]/guide">) {
  const { slug } = await params;
  const guide = findGuide(slug);
  const venue = findVenue(slug);
  if (!guide || !venue) notFound();

  return (
    <div className={caveat.variable}>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <GuideHero guide={guide} venueHref={venueHref(venue)} />
          <OutfitSection guide={guide} />
          <BringSection guide={guide} />
          <PhotoReferenceSection guide={guide} />
          <CourtVibeSection guide={guide} />
          <QuickTipsSection guide={guide} />
        </main>
        <Footer />
      </MotionProvider>
    </div>
  );
}
