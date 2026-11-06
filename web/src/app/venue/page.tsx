import type { Metadata } from "next";
import { VenuePageContent } from "@/components/venue/VenueDirectory/VenuePageContent";

export const metadata: Metadata = {
  title: "Venue — SOSLAY",
  description: "Soslay's curated tennis courts in Jakarta & Bali — indoor, rooftop, outdoor, and tropical.",
};

/** Statis + ISR (bukan render per request) supaya pindah halaman cepat dari cache Vercel. */
export const revalidate = 3600;

/** Halaman Venue (Figma 25:749). /venue?city=… dilayani /venue/kota/[city] (rewrite next.config). */
export default function VenuePage() {
  return <VenuePageContent />;
}
