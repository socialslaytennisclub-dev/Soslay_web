import Image from "next/image";
import { SESSION_STATUS_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { blurProps } from "@/lib/image";
import type { SessionDisplayStatus } from "@/server/admin/types";
import { Badge, type BadgeTone } from "../ui/AdminUI";
import styles from "./Activities.module.css";

/** Sel bersama daftar Activities: baris sesi (SessionsTable) & activity dalam trip (TripRows). */

const STATUS_TONE: Record<SessionDisplayStatus, BadgeTone> = {
  almost_full: "pink",
  published: "lime",
  full: "indigo",
  draft: "neutral",
  scheduled: "indigo",
  completed: "neutral",
  cancelled: "pink",
};

export function StatusBadge({ status }: { status: SessionDisplayStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {SESSION_STATUS_LABEL[status]}
    </Badge>
  );
}

export function Thumb({ src }: { src: string }) {
  return (
    <span className={styles.thumb}>
      <Image src={src} alt="" fill sizes="56px" {...blurProps(src)} />
    </span>
  );
}

export function CapacityBar({ value, max }: { value: number; max: number }) {
  return (
    <span className={styles.capacityTrack}>
      <span className={cx(styles.capacityBar, value >= max && styles.capacityFull)} style={{ width: `${max ? Math.min(value / max, 1) * 100 : 0}%` }} />
    </span>
  );
}

const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** "Sab, 17 Okt" + "07.00–10.00" (WIB). */
export function schedule(s: { startsAt: string; endsAt: string }) {
  return { date: day.format(new Date(s.startsAt)).replace(/\./g, ""), time: `${time.format(new Date(s.startsAt))}–${time.format(new Date(s.endsAt))}` };
}
