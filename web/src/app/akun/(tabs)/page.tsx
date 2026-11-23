import type { Metadata } from "next";
import { ActivityListCard } from "@/components/member/ActivityListCard/ActivityListCard";
import { InfoGrafis } from "@/components/member/InfoGrafis/InfoGrafis";
import { RatingInvite } from "@/components/member/PlayerRating/RatingInvite";
import { MemberCard } from "@/components/member/MemberCard/MemberCard";
import { SlayActivityCard } from "@/components/member/SlayActivityCard/SlayActivityCard";
import { SlayPointCard } from "@/components/member/SlayPointCard/SlayPointCard";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { demoDashboard, memberSessions } from "@/content/member";
import { getMyDashboard } from "@/server/member/dashboard";
import { getMyRatingQueue } from "@/server/member/player-rating";
import { getMyMember } from "@/server/member/profile";
import { getMySessions } from "@/server/member/sessions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard — SOSLAY" };

/** Tab Dashboard (Figma 25:2626): kartu member, Slay Activity, Slay Point, Info Grafis, Activity. */
export default async function DashboardPage() {
  const [mine, me, dashboard, ratingQueue] = await Promise.all([getMySessions(), getMyMember(), getMyDashboard(), getMyRatingQueue()]);
  // Host (beta): pemain yang belum / perlu dinilai ulang → kartu undangan di atas dashboard.
  const ratingDue = ratingQueue?.filter((p) => p.due).length ?? 0;
  const dash = dashboard ?? demoDashboard;
  const sessions = mine ?? memberSessions;
  return (
    <TabPanel label="Dashboard">
      <RatingInvite count={ratingDue} href="/akun/nilai-pemain" context="dashboard" />
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
