import type { Metadata } from "next";
import { SessionEditor } from "@/components/admin/activities/SessionEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { activityTypeOptions, getSessionDraft, venueOptions } from "@/server/admin/sessions-repo";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Buat sesi" };

/** Form Buat sesi; `?from=<id>` = Duplikat dari sesi lain. */
export default async function AdminNewSessionPage({ searchParams }: PageProps<"/admin/activities/new">) {
  const from = (await searchParams).from;
  const fromId = Array.isArray(from) ? from[0] : from;
  const draft = await getSessionDraft(fromId);

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Activities / Buat sesi" title={fromId ? "Duplikat sesi" : "Buat sesi"} />
      <div className={pageStyles.content}>
        <SessionEditor key={fromId ?? "new"} session={draft} types={activityTypeOptions()} venues={await venueOptions()} mode="new" />
      </div>
    </>
  );
}
