"use client";

import { useCountUp } from "@/hooks/useCountUp";
import { useInView } from "@/hooks/useInView";
import { parseStat } from "@/lib/format";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./StatCard.module.css";

type StatCardProps = {
  /** Nilai seperti di desain: "500+", "100%". Angkanya dianimasikan saat terlihat. */
  value: string;
  label: string;
  icon: IconName;
};

/** Figma: Card/Stat */
export function StatCard({ value, label, icon }: StatCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { value: target, prefix, suffix } = parseStat(value);
  const current = useCountUp(target, inView);

  return (
    <div ref={ref} className={styles.root}>
      <div className={styles.card}>
        <div className={styles.text}>
          <p className={styles.value}>
            <span aria-hidden>
              {prefix}
              {current}
              {suffix}
            </span>
            <span className="visually-hidden">{value}</span>
          </p>
          <p className={styles.label}>{label}</p>
        </div>
        <span className={styles.icon}>
          <Icon name={icon} />
        </span>
      </div>
    </div>
  );
}
