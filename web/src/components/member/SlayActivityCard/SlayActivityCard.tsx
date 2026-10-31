import { Chip } from "@/components/ui";
import type { MemberDashboard } from "@/content/member";
import { SummaryCard, SummaryProgress } from "../SummaryCard/SummaryCard";
import styles from "./SlayActivityCard.module.css";

/** Figma 25:2675 — sesi bulan ini, target bulanan, Jam main / Venue / Streak. */
export function SlayActivityCard({ data }: { data: MemberDashboard["activity"] }) {
  const { period, sessions, unit, monthlyTarget, stats } = data;

  return (
    <SummaryCard title="Slay Activity" badge={<Chip tone="soft">{period}</Chip>} value={String(sessions)} unit={unit}>
      <SummaryProgress
        label="Target bulanan"
        valueLabel={`${sessions}/${monthlyTarget} sesi`}
        value={sessions}
        max={monthlyTarget}
      />
      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt className={styles.label}>{stat.label}</dt>
            <dd className={styles.value}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </SummaryCard>
  );
}
