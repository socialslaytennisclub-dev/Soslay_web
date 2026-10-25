import { MemberHeader } from "@/components/member/MemberHeader/MemberHeader";
import { MemberTabs } from "@/components/member/MemberTabs/MemberTabs";
import { getMyMember } from "@/server/member/profile";

/** Header member + tab (Figma 25:2601 dkk.) — dipakai bersama Dashboard, Profile, My Activities, Order. */
export default async function MemberTabsLayout({ children }: { children: React.ReactNode }) {
  const me = await getMyMember();
  return (
    <>
      <MemberHeader data={me?.header} />
      <MemberTabs />
      {children}
    </>
  );
}
