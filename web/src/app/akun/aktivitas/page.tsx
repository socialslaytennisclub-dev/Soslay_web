import type { Metadata } from "next";
import { MyActivities } from "@/components/member/MyActivities/MyActivities";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";

export const metadata: Metadata = { title: "My Activities — SOSLAY" };

/** Tab My Activities (Figma 25:1926). */
export default function MyActivitiesPage() {
  return (
    <TabPanel label="My Activities">
      <MyActivities />
    </TabPanel>
  );
}
