import type { Metadata } from "next";
import { ActivityListCard } from "@/components/member/ActivityListCard/ActivityListCard";
import { InfoGrafis } from "@/components/member/InfoGrafis/InfoGrafis";
import { MemberCard } from "@/components/member/MemberCard/MemberCard";
import { SlayActivityCard } from "@/components/member/SlayActivityCard/SlayActivityCard";
import { SlayPointCard } from "@/components/member/SlayPointCard/SlayPointCard";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { memberSessions } from "@/content/member";
import { getMyMember } from "@/server/member/profile";
import { getMySessions } from "@/server/member/sessions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard — SOSLAY" };

/** Tab Dashboard (Figma 25:2626): kartu member, Slay Activity, Slay Point, Info Grafis, Activity. */
export default async function DashboardPage() {
  const [mine, me] = await Promise.all([getMySessions(), getMyMember()]);
  const sessions = mine ?? memberSessions;
  return (
    <TabPanel label="Dashboard">
      <div className={styles.summary}>
        <MemberCard data={me && { name: me.header.name, tier: me.header.tier, memberId: me.header.memberId }} />
        <SlayActivityCard />
        <SlayPointCard />
      </div>
      <div className={styles.detail}>
        <InfoGrafis />
        <ActivityListCard sessions={sessions} />
      </div>
    </TabPanel>
  );
}
