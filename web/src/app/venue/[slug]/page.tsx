import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { notFound } from "next/navigation";
import { SpotlightHero } from "@/components/guide/SpotlightHero";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { MemberCta } from "@/components/sections/MemberCta/MemberCta";
import { UpcomingActivities } from "@/components/venue/UpcomingActivities/UpcomingActivities";
import { VenueGallery } from "@/components/venue/VenueGallery/VenueGallery";
import { photosForVenue } from "@/content/gallery";
import { findGuide, guideHref } from "@/content/guides";
import { venueCities, venuePage } from "@/content/venues";
import { formatTanggalISO } from "@/lib/format";
import { upcomingSessions } from "@/lib/sessions";
import { getWebsiteSessions } from "@/server/public/sessions";
import { findWebsiteVenue, getWebsiteVenues } from "@/server/public/venues";

/** Catatan tulisan tangan di kartu hero (Figma: Caveat Bold). */
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-caveat" });

/** Venue aktif di-prerender saat build; venue baru dari admin dirender saat pertama dibuka. */
export async function generateStaticParams() {
  return (await getWebsiteVenues()).map((venue) => ({ slug: venue.slug }));
}

/** Sesi mendatang & sisa slot dihitung dari jam sekarang → render ulang tiap jam (dan saat admin menyimpan sesi). */
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/venue/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const venue = await findWebsiteVenue(slug);
  if (!venue) return {};
  return {
    title: `${venue.name} — SOSLAY`,
    description: `${venue.tagline} ${venue.description}`,
  };
}

/** Venue detail (Figma Website v2 375:3655): hero · Upcoming Activities · galeri sesi lalu · ajakan member. */
export default async function VenueDetailPage({ params }: PageProps<"/venue/[slug]">) {
  const { slug } = await params;
  const venue = await findWebsiteVenue(slug);
  if (!venue) notFound();

  const guide = findGuide(venue.slug);
  const city = venueCities.find((c) => c.city === venue.city);
  const upcoming = upcomingSessions(await getWebsiteSessions(), new Date())
    .filter((session) => session.venue.name === venue.name)
    .slice(0, venuePage.detail.upcoming.limit);
  const photos = photosForVenue(venue.slug);
  const dateLabels = Object.fromEntries(photos.map((photo) => [photo.id, formatTanggalISO(photo.date, venue.city)]));
  const heroImage = venue.heroImage ?? venue.image;

  return (
    <div className={caveat.variable}>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <SpotlightHero
            breadcrumb={[
              { label: "Venue", href: "/venue" },
              { label: venue.area ?? venue.city, href: city ? `/venue?city=${city.slug}#daftar-venue` : "/venue" },
              { label: venue.name },
            ]}
            eyebrow={venuePage.detail.eyebrow}
            title={venue.name}
            intro={venue.description}
            photo={guide?.hero ?? { src: heroImage, alt: `${venue.name} court`, position: venue.heroImage ? undefined : venue.imagePosition }}
            card={{
              name: venue.name,
              facts: guide?.facts ?? [venue.type, venue.area ?? venue.city].filter(Boolean),
              note: guide?.note,
              ink: guide?.theme.ink,
            }}
            cta={guide ? { label: venuePage.detail.guideCta, href: guideHref(venue.slug) } : undefined}
          />
          <UpcomingActivities venueName={venue.name} sessions={upcoming} />
          <VenueGallery venueName={venue.name} photos={photos} dateLabels={dateLabels} />
          <MemberCta />
        </main>
        <Footer />
      </MotionProvider>
    </div>
  );
}
