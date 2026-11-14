import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberDetailView } from "@/components/admin/members/MemberDetailView";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getLoginEmailStatus } from "@/server/admin/login-email";
import { bookableSessions, getMember } from "@/server/admin/repo";
import { canAccess, getAdminSession } from "@/server/admin/session";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/members/[id]">): Promise<Metadata> {
  const member = await getMember((await params).id);
  return { title: member ? member.fullName : "Member tidak ditemukan" };
}

/** Admin / 03 Member Detail (Figma 25:4301). */
export default async function AdminMemberPage({ params }: PageProps<"/admin/members/[id]">) {
  const member = await getMember((await params).id);
  if (!member) notFound();
  // Sesi admin sudah di-cache layout → murah. Status email login (panggilan Auth) hanya untuk staf dengan
  // izin members edit, paralel dengan data booking (aksi server mengecek izin ulang).
  const canEditLogin = canAccess(await getAdminSession(), "members", "edit");
  const [bookable, loginStatus] = await Promise.all([bookableSessions(member.id), canEditLogin && isSupabaseConfigured ? getLoginEmailStatus(member.id) : null]);
  const loginEmail = canEditLogin ? { status: loginStatus } : undefined;

  return (
    <>
      <AdminTopbar breadcrumb={`CRM / Members / ${member.fullName}`} title="Detail member" />
      <div className={pageStyles.content}>
        <MemberDetailView member={member} bookable={bookable} loginEmail={loginEmail} />
      </div>
    </>
  );
}
