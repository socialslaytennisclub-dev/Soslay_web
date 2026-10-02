"use client";

import { useEffect, useRef } from "react";
import { activityHeatmap } from "@/content/member";
import { cx } from "@/lib/cx";
import { formatTanggalISO } from "@/lib/format";
import type { HeatmapData } from "@/lib/heatmap";
import styles from "./InfoGrafis.module.css";

/** Label baris (Figma hanya Sen, Rab, Jum, Min). */
const DAY_LABELS = ["Sen", "", "Rab", "", "Jum", "", "Min"];

type ActivityHeatmapProps = {
  data: HeatmapData;
  weekCount: number;
};

/** Figma: panel/heatmap — kolom = minggu, baris = hari; sel 20px, gap 4, lime = sesi berikutnya. */
export function ActivityHeatmap({ data, weekCount }: ActivityHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Periode panjang (1 Thn) bisa di-scroll; selalu mulai dari minggu terbaru di kanan.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weekCount]);

  return (
    <section className={cx(styles.panel, styles.heatmapPanel)} aria-labelledby="heatmap-title">
      <div className={styles.panelHead}>
        <h3 id="heatmap-title" className={styles.panelTitle}>
          {activityHeatmap.title}
        </h3>
        <p className={styles.panelSubtitle}>
          {data.total} sesi dalam {weekCount} minggu
        </p>
      </div>

      <div className={styles.heatmap}>
        <div className={styles.dayLabels} aria-hidden>
          {DAY_LABELS.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div ref={scrollRef} className={styles.heatmapScroll}>
          <div className={styles.months} aria-hidden>
            {data.months.map((month, index) => (
              <span key={`${month.label}-${index}`} style={{ gridColumn: `span ${month.span}` }}>
                {month.span > 1 ? month.label : ""}
              </span>
            ))}
          </div>
          <div
            className={styles.weeks}
            role="img"
            aria-label={`Peta sesi per hari, ${weekCount} minggu terakhir. Sesi berikutnya ${formatTanggalISO(activityHeatmap.nextSession, "Jakarta")}.`}
          >
            {data.weeks.map((week) => (
              <div key={week[0].date} className={styles.week}>
                {week.map((day) => (
                  <span
                    key={day.date}
                    className={cx(styles.cell, styles[`level${day.level}`], day.isNext && styles.next)}
                    title={`${formatTanggalISO(day.date, "Jakarta")} · ${day.isNext ? "sesi berikutnya" : `${day.count} sesi`}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.heatmapLegend}>
        <span className={styles.scale}>
          Sedikit
          {[0, 1, 2, 3].map((level) => (
            <span key={level} className={cx(styles.swatchSquare, styles[`level${level}`])} aria-hidden />
          ))}
          Banyak
        </span>
        <span className={styles.scale}>
          <span className={cx(styles.swatchSquare, styles.next)} aria-hidden />
          Sesi berikutnya
        </span>
      </div>
    </section>
  );
}
