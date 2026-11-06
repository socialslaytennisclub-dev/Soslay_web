import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripPage } from "@/components/member/TripPage/TripPage";
import { getMyTrip } from "@/server/member/trips";

export async function generateMetadata({ params }: PageProps<"/akun/trip/[slug]">): Promise<Metadata> {
  const trip = await getMyTrip((await params).slug);
  return { title: `${trip?.title ?? "Tennis trip"} — SOSLAY` };
}

/** Halaman trip member (Figma MT-2): paket & sisa pembayaran, Rundown · Activities · Termasuk. */
export default async function MemberTripPage({ params }: PageProps<"/akun/trip/[slug]">) {
  const trip = await getMyTrip((await params).slug);
  // Bukan peserta trip ini → 404, tanpa membocorkan bahwa trip-nya ada.
  if (!trip) notFound();
  return <TripPage trip={trip} />;
}
