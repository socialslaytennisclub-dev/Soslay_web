import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionEditor } from "@/components/admin/activities/SessionEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { activityTypeOptions, getSession, venueOptions } from "@/server/admin/sessions-repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/activities/[id]">): Promise<Metadata> {
  const session = await getSession((await params).id);
  return { title: session ? `Edit ${session.title}` : "Sesi tidak ditemukan" };
}

/** Admin / 05 Activity Editor (Figma 25:5098). */
export default async function AdminSessionPage({ params }: PageProps<"/admin/activities/[id]">) {
  const session = await getSession((await params).id);
  if (!session) notFound();

  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Activities / ${session.title}`} title="Edit sesi" />
      <div className={pageStyles.content}>
        <SessionEditor key={session.id} session={session} types={activityTypeOptions()} venues={await venueOptions()} mode="edit" />
      </div>
    </>
  );
}
