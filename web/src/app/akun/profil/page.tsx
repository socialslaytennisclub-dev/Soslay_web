import type { Metadata } from "next";
import { ProfileForm } from "@/components/member/ProfileForm/ProfileForm";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";

export const metadata: Metadata = { title: "Profile — SOSLAY" };

/** Tab Profile (Figma 25:2250). */
export default function ProfilePage() {
  return (
    <TabPanel label="Profile">
      <ProfileForm />
    </TabPanel>
  );
}
