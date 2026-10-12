import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenueEditor } from "@/components/admin/catalog/VenueEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { getVenueForm, siteImageOptions } from "@/server/admin/catalog-repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/venues/[slug]">): Promise<Metadata> {
  const venue = await getVenueForm((await params).slug);
  return { title: venue ? `Edit ${venue.name}` : "Venue tidak ditemukan" };
}

export default async function AdminVenuePage({ params, searchParams }: PageProps<"/admin/venues/[slug]">) {
  const venue = await getVenueForm((await params).slug);
  if (!venue) notFound();
  const saved = (await searchParams).saved;

  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Venues / ${venue.name}`} title="Edit venue" />
      <div className={pageStyles.content}>
        <VenueEditor key={venue.slug} initial={venue} imageOptions={siteImageOptions()} initialNotice={saved ? "Venue baru tersimpan." : undefined} />
      </div>
    </>
  );
}
