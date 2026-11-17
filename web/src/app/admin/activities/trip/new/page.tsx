import type { Metadata } from "next";
import { TripEditor } from "@/components/admin/activities/TripEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { memberChoices } from "@/server/admin/repo";
import { activityTypeOptions, venueOptions } from "@/server/admin/sessions-repo";
import { tripCandidates } from "@/server/admin/trips-repo";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Buat trip" };

/** Admin / 05x Buat trip — Tennis Escape (BR-22). Dibuka dari Buat sesi › Tipe sesi = Tennis Escape. */
export default async function AdminNewTripPage() {
  const [venues, candidates, members] = await Promise.all([venueOptions(), tripCandidates(null), memberChoices()]);
  return (
    <>
      <AdminTopbar breadcrumb="CMS / Activities / Buat trip" title="Buat trip" />
      <div className={pageStyles.content}>
        <TripEditor initial={null} venues={venues} types={activityTypeOptions()} candidates={candidates} members={members} />
      </div>
    </>
  );
}
