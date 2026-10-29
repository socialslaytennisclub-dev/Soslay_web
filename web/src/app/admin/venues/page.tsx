import type { Metadata } from "next";
import { VenueGrid } from "@/components/admin/catalog/VenueGrid";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { ToastOnMount } from "@/components/admin/ui/Toaster";
import { listVenues } from "@/server/admin/catalog-repo";
import { adminNow } from "@/server/admin/dataset";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Venues" };

/** Admin / 07 Venues (Figma 25:5882). */
export default async function AdminVenuesPage({ searchParams }: PageProps<"/admin/venues">) {
  const { deleted } = await searchParams;
  const venues = await listVenues();
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(adminNow());

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Venues" title="Venues" />
      <div className={pageStyles.content}>
        {deleted && <ToastOnMount text="Venue dihapus." />}
        <VenueGrid initial={venues} monthLabel={monthLabel} />
      </div>
    </>
  );
}
