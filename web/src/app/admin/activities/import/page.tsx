import type { Metadata } from "next";
import { ImportActivity } from "@/components/admin/activities/ImportActivity";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { activityTypeOptions, venueOptions } from "@/server/admin/sessions-repo";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Import activity" };

/** Import activity dari file peserta Kuyy: activity + peserta dibuat sekaligus. */
export default async function AdminImportActivityPage() {
  const venues = (await venueOptions()).map((v) => ({ name: v.name, city: v.city }));
  return (
    <>
      <AdminTopbar breadcrumb="CMS / Activities / Import activity" title="Import activity dari Kuyy" />
      <div className={pageStyles.content}>
        <ImportActivity types={activityTypeOptions()} venues={venues} />
      </div>
    </>
  );
}
