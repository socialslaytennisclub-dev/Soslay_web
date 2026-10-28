import Link from "next/link";
import { Chip, type ChipTone } from "@/components/ui";
import { sessionStatusLabel, splitSessions, type MemberSession, type MemberSessionStatus } from "@/content/member";
import { formatJamRange, formatTanggalBox, formatTanggalISO } from "@/lib/format";
import styles from "./ActivityListCard.module.css";

const statusTone: Record<MemberSessionStatus, ChipTone> = {
  upcoming: "lime",
  registered: "indigo",
  done: "neutral",
};

/** Figma 25:2932 — 5 sesi terdekat/terakhir dengan status. */
export function ActivityListCard({ sessions }: { sessions: MemberSession[] }) {
  const { upcoming, past } = splitSessions(sessions);
  const items = [...upcoming, ...past].slice(0, 5);

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h2 className={styles.title}>Activity</h2>
        <Link href="/akun/aktivitas" scroll={false} className={styles.more}>
          Lihat semua
        </Link>
      </header>
      {items.length === 0 && <p className={styles.detail}>Belum ada sesi. Booking sesi di Kuyy — setelah admin memasukkan data peserta, sesimu muncul di sini.</p>}
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
                <p className={styles.name}>
                  <Link href={`/akun/aktivitas/${session.slug}`} className={styles.nameLink}>
                    {session.title}
                  </Link>
                </p>
                <p className={styles.detail}>
                  {session.venue} · {formatJamRange(session.start, session.end, "–")}
                </p>
              </div>
              {session.hostOnly ? <Chip tone="navy">Host</Chip> : <Chip tone={statusTone[session.status]}>{sessionStatusLabel[session.status]}</Chip>}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
