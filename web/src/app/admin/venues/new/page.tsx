import type { Metadata } from "next";
import { VenueEditor } from "@/components/admin/catalog/VenueEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { emptyVenueForm, siteImageOptions } from "@/server/admin/catalog-repo";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Tambah venue" };

export default function AdminNewVenuePage() {
  return (
    <>
      <AdminTopbar breadcrumb="CMS / Venues / Tambah" title="Tambah venue" />
      <div className={pageStyles.content}>
        <VenueEditor initial={emptyVenueForm()} imageOptions={siteImageOptions()} />
      </div>
    </>
  );
}
