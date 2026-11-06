import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripEditor } from "@/components/admin/activities/TripEditor";
import { TripTabs } from "@/components/admin/activities/TripTabs";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { activityTypeOptions, venueOptions } from "@/server/admin/sessions-repo";
import { getTrip, tripCandidates } from "@/server/admin/trips-repo";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Edit trip" };

/** Admin / 05x Edit trip — tab Info & activities · Rundown (anchor) · Peserta & pembayaran. */
export default async function AdminTripPage({ params }: PageProps<"/admin/activities/trip/[id]">) {
  const { id } = await params;
  const [trip, venues, candidates] = await Promise.all([getTrip(id), venueOptions(), tripCandidates(id)]);
  if (!trip) notFound();
  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Activities / ${trip.title}`} title={trip.title} />
      <div className={pageStyles.content}>
        <TripTabs tripId={trip.id} active="info" />
        <TripEditor key={trip.id} initial={trip} venues={venues} types={activityTypeOptions()} candidates={candidates} />
      </div>
    </>
  );
}
