import type { Metadata } from "next";
import { ProfileForm } from "@/components/member/ProfileForm/ProfileForm";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { getMyMember } from "@/server/member/profile";

export const metadata: Metadata = { title: "Profile — SOSLAY" };

/** Tab Profile (Figma 25:2250). */
export default async function ProfilePage() {
  const me = await getMyMember();
  return (
    <TabPanel label="Profile">
      <ProfileForm initial={me?.profile} />
    </TabPanel>
  );
}
