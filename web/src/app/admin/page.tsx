import type { Metadata } from "next";
import {
  Distribution,
  KpiRow,
  NewestMembers,
  RecentOrders,
  TopProducts,
  UpcomingSessions,
  WeeklyBookings,
} from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { getOverview } from "@/server/admin/repo";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Overview — Admin SOSLAY" };

const RANGES = [4, 12, 52];

/** Admin / 01 Overview (Figma 25:3186). ?range=4|12|52 untuk grafik booking. */
export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const { range: rawRange } = await searchParams;
  const range = RANGES.includes(Number(rawRange)) ? Number(rawRange) : 12;
  const data = await getOverview(range);

  const now = new Date(data.generatedAt);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(now);
  const monthShort = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(now).replace(".", "");
  const monthLong = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(now);

  return (
    <>
      <AdminTopbar breadcrumb="Umum / Overview" title="Overview" />
      <div className={styles.content}>
        <div className={styles.greeting}>
          <div>
            <h2 className={styles.hello}>Halo, Rara 👋</h2>
            <p className={styles.summary}>Ringkasan Soslay per {dateLabel}</p>
          </div>
          <div className={styles.actions}>
            <AdminButton icon="download-simple" disabled title="Segera">
              Export laporan
            </AdminButton>
            <AdminButton variant="primary" icon="plus-bold" href="/admin/activities/new">
              Buat sesi baru
            </AdminButton>
          </div>
        </div>

        <KpiRow data={data} monthLabel={monthShort} />

        <div className={styles.row}>
          <WeeklyBookings data={data} range={range} />
          <UpcomingSessions data={data} />
        </div>
        <div className={styles.row}>
          <NewestMembers data={data} />
          <Distribution data={data} />
        </div>
        <div className={styles.row}>
          <RecentOrders data={data} />
          <TopProducts data={data} monthLabel={monthLong} />
        </div>
      </div>
    </>
  );
}
