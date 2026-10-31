import type { Metadata } from "next";
import { ActivityListCard } from "@/components/member/ActivityListCard/ActivityListCard";
import { InfoGrafis } from "@/components/member/InfoGrafis/InfoGrafis";
import { MemberCard } from "@/components/member/MemberCard/MemberCard";
import { SlayActivityCard } from "@/components/member/SlayActivityCard/SlayActivityCard";
import { SlayPointCard } from "@/components/member/SlayPointCard/SlayPointCard";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { demoDashboard, memberSessions } from "@/content/member";
import { getMyDashboard } from "@/server/member/dashboard";
import { getMyMember } from "@/server/member/profile";
import { getMySessions } from "@/server/member/sessions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard — SOSLAY" };

/** Tab Dashboard (Figma 25:2626): kartu member, Slay Activity, Slay Point, Info Grafis, Activity. */
export default async function DashboardPage() {
  const [mine, me, dashboard] = await Promise.all([getMySessions(), getMyMember(), getMyDashboard()]);
  const dash = dashboard ?? demoDashboard;
  const sessions = mine ?? memberSessions;
  return (
    <TabPanel label="Dashboard">
      <div className={styles.summary}>
        <MemberCard data={me && { name: me.header.name, tier: me.header.tier, memberId: me.header.memberId }} />
        <SlayActivityCard data={dash.activity} />
        <SlayPointCard data={dash.points} />
      </div>
      <div className={styles.detail}>
        <InfoGrafis data={dash} />
        <ActivityListCard sessions={sessions} />
      </div>
    </TabPanel>
  );
}
