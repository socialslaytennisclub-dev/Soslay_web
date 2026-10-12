import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberEditor } from "@/components/admin/members/MemberEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { getMemberForm } from "@/server/admin/repo";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Edit member" };

export default async function AdminEditMemberPage({ params }: PageProps<"/admin/members/[id]/edit">) {
  const member = await getMemberForm((await params).id);
  if (!member) notFound();

  return (
    <>
      <AdminTopbar breadcrumb={`CRM / Members / ${member.fullName} / Edit`} title="Edit member" />
      <div className={pageStyles.content}>
        <MemberEditor key={member.id} initial={member} />
      </div>
    </>
  );
}
