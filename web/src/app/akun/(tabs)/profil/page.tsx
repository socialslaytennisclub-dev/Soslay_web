import type { Metadata } from "next";
import { ProfileForm } from "@/components/member/ProfileForm/ProfileForm";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { KudosCard } from "@/components/member/Kudos/KudosCard";
import { getMyKudos } from "@/server/member/kudos";
import { getMyMember } from "@/server/member/profile";

export const metadata: Metadata = { title: "Profile — SOSLAY" };

/** Tab Profile (Figma 25:2250). */
export default async function ProfilePage() {
  const [me, kudos] = await Promise.all([getMyMember(), getMyKudos()]);
  return (
    <TabPanel label="Profile">
      {kudos && <KudosCard kudos={kudos} />}
      <ProfileForm initial={me?.profile} />
    </TabPanel>
  );
}
