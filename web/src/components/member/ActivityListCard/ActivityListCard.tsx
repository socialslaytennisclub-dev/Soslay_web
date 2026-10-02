import Link from "next/link";
import { Chip, type ChipTone } from "@/components/ui";
import { memberSessions, sessionStatusLabel, type MemberSessionStatus } from "@/content/member";
import { formatJamRange, formatTanggalBox, formatTanggalISO } from "@/lib/format";
import styles from "./ActivityListCard.module.css";

const statusTone: Record<MemberSessionStatus, ChipTone> = {
  upcoming: "lime",
  registered: "indigo",
  done: "neutral",
};

/** Figma 25:2932 — 5 sesi terdekat/terakhir dengan status. */
export function ActivityListCard() {
  // Mendatang dulu (terdekat di atas), lalu riwayat terbaru.
  const upcoming = memberSessions.filter((s) => s.status !== "done").sort((a, b) => a.date.localeCompare(b.date));
  const past = memberSessions.filter((s) => s.status === "done").sort((a, b) => b.date.localeCompare(a.date));
  const items = [...upcoming, ...past].slice(0, 5);

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h2 className={styles.title}>Activity</h2>
        <Link href="/akun/aktivitas" scroll={false} className={styles.more}>
          Lihat semua
        </Link>
      </header>
      <ul className={styles.list}>
        {items.map((session) => {
          const box = formatTanggalBox(session.date);
          return (
            <li key={session.slug} className={styles.item}>
              <time dateTime={session.date} className={styles.date} title={formatTanggalISO(session.date, session.city)}>
                <span className={styles.day}>{box.day}</span>
                <span className={styles.month}>{box.month}</span>
              </time>
              <div className={styles.text}>
                <p className={styles.name}>{session.title}</p>
                <p className={styles.detail}>
                  {session.venue} · {formatJamRange(session.start, session.end, "–")}
                </p>
              </div>
              <Chip tone={statusTone[session.status]}>{sessionStatusLabel[session.status]}</Chip>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
