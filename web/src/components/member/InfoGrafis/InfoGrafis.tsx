"use client";

import { useMemo, useState } from "react";
import { Icon, SegmentedControl, type IconName } from "@/components/ui";
import { activityHeatmap, favorites, insightPeriods, type InsightPeriod } from "@/content/member";
import { buildHeatmap } from "@/lib/heatmap";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { TargetRings } from "./TargetRings";
import styles from "./InfoGrafis.module.css";

/** Figma 25:2718 — toggle periode, ring target tahunan, heatmap hari aktif, kartu insight. */
export function InfoGrafis() {
  const [period, setPeriod] = useState<InsightPeriod>("3m");
  const active = insightPeriods.find((option) => option.value === period) ?? insightPeriods[1];

  const heatmap = useMemo(
    () => buildHeatmap(activityHeatmap.weeks, activityHeatmap.lastWeekStart, active.weeks, activityHeatmap.nextSession),
    [active.weeks],
  );

  const insights: { icon: IconName; label: string; value: string }[] = [
    { icon: "calendar-check-bold", label: "Hari favorit", value: heatmap.favoriteDay ?? "—" },
    { icon: "clock", label: "Jam favorit", value: favorites.time },
    { icon: "map-pin", label: "Venue favorit", value: favorites.venue },
  ];

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.title}>Info Grafis</h2>
          <p className={styles.subtitle}>Performa main kamu · {active.caption}</p>
        </div>
        <SegmentedControl label="Periode" options={insightPeriods} value={period} onChange={setPeriod} />
      </header>

      <div className={styles.panels}>
        <TargetRings />
        <ActivityHeatmap data={heatmap} weekCount={active.weeks} />
      </div>

      <ul className={styles.insights}>
        {insights.map((insight) => (
          <li key={insight.label} className={styles.insight}>
            <span className={styles.badge}>
              <Icon name={insight.icon} size={20} />
            </span>
            <span className={styles.insightText}>
              <span className={styles.insightLabel}>{insight.label}</span>
              <span className={styles.insightValue}>{insight.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
