import type { Metadata } from "next";
import { MyActivities } from "@/components/member/MyActivities/MyActivities";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { memberSessions } from "@/content/member";
import { getMySessions } from "@/server/member/sessions";

export const metadata: Metadata = { title: "My Activities — SOSLAY" };

/** Tab My Activities (Figma 25:1926). */
export default async function MyActivitiesPage() {
  const sessions = (await getMySessions()) ?? memberSessions;
  return (
    <TabPanel label="My Activities">
      <MyActivities sessions={sessions} />
    </TabPanel>
  );
}
