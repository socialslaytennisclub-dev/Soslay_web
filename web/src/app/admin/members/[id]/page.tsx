import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MEMBER_TABS, MemberDetailView, type MemberTab } from "@/components/admin/members/MemberDetailView";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { bookableSessions, getMember, getMemberKudos, getMemberReviews } from "@/server/admin/repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/members/[id]">): Promise<Metadata> {
  const member = await getMember((await params).id);
  return { title: member ? member.fullName : "Member tidak ditemukan" };
}

/** Admin / 03 Member Detail (Figma 25:4301). */
export default async function AdminMemberPage({ params, searchParams }: PageProps<"/admin/members/[id]">) {
  const requested = (await searchParams).tab;
  const tab: MemberTab = MEMBER_TABS.find((t) => t.key === requested)?.key ?? "ringkasan";
  const member = await getMember((await params).id);
  if (!member) notFound();
  // Kudos & review hanya dimuat di tab yang menampilkannya.
  const [bookable, kudos, reviews] = await Promise.all([
    bookableSessions(member.id),
    tab === "ringkasan" ? getMemberKudos(member.id) : null,
    tab === "review" ? getMemberReviews(member.id) : null,
  ]);

  return (
    <>
      <AdminTopbar breadcrumb={`CRM / Members / ${member.fullName}`} title="Detail member" />
      <div className={pageStyles.content}>
        <MemberDetailView member={member} bookable={bookable} tab={tab} kudos={kudos} reviews={reviews} />
      </div>
    </>
  );
}
