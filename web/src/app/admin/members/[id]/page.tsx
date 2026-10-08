import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberDetailView } from "@/components/admin/members/MemberDetailView";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { getMember } from "@/server/admin/repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/members/[id]">): Promise<Metadata> {
  const member = await getMember((await params).id);
  return { title: member ? member.fullName : "Member tidak ditemukan" };
}

/** Admin / 03 Member Detail (Figma 25:4301). */
export default async function AdminMemberPage({ params }: PageProps<"/admin/members/[id]">) {
  const member = await getMember((await params).id);
  if (!member) notFound();

  return (
    <>
      <AdminTopbar breadcrumb={`CRM / Members / ${member.fullName}`} title="Detail member" />
      <div className={pageStyles.content}>
        <MemberDetailView member={member} />
      </div>
    </>
  );
}
