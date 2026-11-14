import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { caveat } from "@/fonts/caveat";
import { SpotlightHero } from "@/components/guide/SpotlightHero";
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
import { cityHref, venueCardInfo, venueCities, venueHref } from "@/content/venues";
import { cityInEnglish } from "@/lib/venue-options";
import { findWebsiteVenue } from "@/server/public/venues";

/** Hanya venue yang punya panduan yang di-prerender; slug lain → 404. */
export function generateStaticParams() {
  return participantGuides.map((guide) => ({ slug: guide.venueSlug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/venue/[slug]/guide">): Promise<Metadata> {
  const { slug } = await params;
  const [guide, venue] = [findGuide(slug), await findWebsiteVenue(slug)];
  if (!guide || !venue) return {};
  return {
    title: `Participant Guide — ${venue.name} — SOSLAY`,
    description: guide.intro,
  };
}

/** Participant Guideline per venue (Figma Website v2 375:4188). */
export default async function ParticipantGuidePage({ params }: PageProps<"/venue/[slug]/guide">) {
  const { slug } = await params;
  const guide = findGuide(slug);
  const venue = await findWebsiteVenue(slug);
  if (!guide || !venue) notFound();

  return (
    <div className={caveat.variable}>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <SpotlightHero
            breadcrumb={[
              { label: "Venue", href: "/venue" },
              { label: venue.area ?? venue.city, href: `${cityHref(venueCities.find((c) => c.city === venue.city)?.slug)}#daftar-venue` },
              { label: venue.name, href: venueHref(venue) },
              { label: "Participant Guideline" },
            ]}
            eyebrow="Participant Guideline"
            title={venue.name}
            intro={guide.intro}
            photo={guide.hero}
            card={{ name: venue.name, ...venueCardInfo(venue, cityInEnglish), ink: guide.theme.ink }}
          />
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
