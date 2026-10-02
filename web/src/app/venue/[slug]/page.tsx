import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { VenueGallery } from "@/components/venue/VenueGallery/VenueGallery";
import { VenueHero } from "@/components/venue/VenueHero/VenueHero";
import { sessions } from "@/content/activity";
import { photosForVenue } from "@/content/gallery";
import { findVenue, venueList } from "@/content/venues";
import { formatTanggalISO } from "@/lib/format";
import { upcomingSessions } from "@/lib/sessions";

/** Semua venue di-prerender saat build. Slug lain → 404. */
export function generateStaticParams() {
  return venueList.map((venue) => ({ slug: venue.slug }));
}

export const dynamicParams = false;

/** "Sesi berikutnya" dihitung dari tanggal hari ini → render ulang tiap jam. */
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/venue/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const venue = findVenue(slug);
  if (!venue) return {};
  return {
    title: `${venue.name} — SOSLAY`,
    description: `${venue.tagline} ${venue.description}`,
  };
}

/** Venue detail (Figma 25:894 + lightbox 25:1145). */
export default async function VenueDetailPage({ params }: PageProps<"/venue/[slug]">) {
  const { slug } = await params;
  const venue = findVenue(slug);
  if (!venue) notFound();

  const nextSession = upcomingSessions(sessions, new Date()).find((session) => session.venue.name === venue.name);
  const photos = photosForVenue(venue.slug);
  const dateLabels = Object.fromEntries(photos.map((photo) => [photo.id, formatTanggalISO(photo.date, venue.city)]));

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <VenueHero venue={venue} nextSession={nextSession} />
          <VenueGallery venueName={venue.name} photos={photos} dateLabels={dateLabels} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
