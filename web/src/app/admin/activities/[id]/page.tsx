import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionEditor } from "@/components/admin/activities/SessionEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { memberChoices } from "@/server/admin/repo";
import { activityTypeOptions, getSession, venueOptions } from "@/server/admin/sessions-repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/activities/[id]">): Promise<Metadata> {
  const session = await getSession((await params).id);
  return { title: session ? `Edit ${session.title}` : "Sesi tidak ditemukan" };
}

/** Admin / 05 Activity Editor (Figma 25:5098). */
const SAVED: Record<string, string> = {
  new: "Sesi baru tersimpan dan sudah tampil di website (kalau statusnya Published).",
  series: "8 sesi mingguan dibuat. Ini sesi pertamanya — sesi lain ada di daftar Activities.",
};

export default async function AdminSessionPage({ params, searchParams }: PageProps<"/admin/activities/[id]">) {
  const session = await getSession((await params).id);
  const saved = (await searchParams).saved;
  if (!session) notFound();

  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Activities / ${session.title}`} title="Edit sesi" />
      <div className={pageStyles.content}>
        <SessionEditor key={session.id} session={session} types={activityTypeOptions()} venues={await venueOptions()} mode="edit" members={await memberChoices()} initialNotice={typeof saved === "string" ? SAVED[saved] : undefined} />
      </div>
    </>
  );
}
