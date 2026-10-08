import Image from "next/image";
import Link from "next/link";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { blurProps } from "@/lib/image";
import type { SessionDisplayStatus, SessionRow } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { Badge, desktopOnlyClass, MobileCard, MobileCardList, type BadgeTone } from "../ui/AdminUI";
import styles from "./Activities.module.css";

const STATUS: Record<SessionDisplayStatus, { label: string; tone: BadgeTone }> = {
  almost_full: { label: "Hampir penuh", tone: "pink" },
  published: { label: "Published", tone: "lime" },
  full: { label: "Penuh", tone: "indigo" },
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Terjadwal", tone: "indigo" },
  completed: { label: "Selesai", tone: "neutral" },
  cancelled: { label: "Dibatalkan", tone: "pink" },
};

const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function schedule(s: SessionRow) {
  return {
    date: day.format(new Date(s.startsAt)).replace(/\./g, "").replace(",", ","),
    time: `${time.format(new Date(s.startsAt))}–${time.format(new Date(s.endsAt))}`,
  };
}

function Capacity({ s }: { s: SessionRow }) {
  const full = s.booked >= s.capacity;
  return (
    <span className={styles.capacity}>
      <span className={styles.capacityHead}>
        <span className={styles.capacityValue}>
          {s.booked}/{s.capacity}
        </span>
        {s.waitlisted > 0 && <span className={styles.waitlist}>+{s.waitlisted} waitlist</span>}
      </span>
      <span className={styles.capacityTrack}>
        <span className={cx(styles.capacityBar, full && styles.capacityFull)} style={{ width: `${Math.min(s.booked / s.capacity, 1) * 100}%` }} />
      </span>
    </span>
  );
}

function Thumb({ s }: { s: SessionRow }) {
  return (
    <span className={styles.thumb}>
      <Image src={s.image} alt="" fill sizes="56px" {...blurProps(s.image)} />
    </span>
  );
}

/** Tabel Activities (Figma 25:4725) + versi kartu di HP. */
export function SessionsTable({ items }: { items: SessionRow[] }) {
  if (items.length === 0) {
    return <p className={styles.empty}>Tidak ada sesi untuk filter ini.</p>;
  }

  return (
    <>
      <MobileCardList label="Daftar sesi">
        {items.map((s) => {
          const when = schedule(s);
          return (
            <MobileCard
              key={s.id}
              href={`/admin/activities/${s.id}`}
              title={
                <span className={styles.sessionCell}>
                  <Thumb s={s} />
                  <span className={styles.sessionText}>
                    <span className={styles.sessionTitle}>{s.title}</span>
                    <span className={styles.sessionMeta}>
                      {when.date} · {when.time}
                    </span>
                  </span>
                </span>
              }
              aside={<Badge tone={STATUS[s.displayStatus].tone} dot>{STATUS[s.displayStatus].label}</Badge>}
              meta={[
                { label: "Venue", value: s.venueName },
                { label: "Kapasitas", value: <Capacity s={s} /> },
                { label: "Harga", value: formatRupiahPlain(s.price) },
              ]}
            />
          );
        })}
      </MobileCardList>

      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sesi</th>
              <th>Jadwal</th>
              <th>Venue</th>
              <th>Kapasitas</th>
              <th>Harga</th>
              <th>Status</th>
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const when = schedule(s);
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/activities/${s.id}`} className={styles.sessionCell}>
                      <Thumb s={s} />
                      <span className={styles.sessionText}>
                        <span className={styles.sessionTitle}>{s.title}</span>
                        <span className={styles.sessionMeta}>{s.typeLabel}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className={styles.cellStrong}>{when.date}</span>
                    <span className={styles.sessionMeta}>{when.time}</span>
                  </td>
                  <td>
                    <span className={styles.cellName}>{s.venueName}</span>
                    <span className={styles.sessionMeta}>
                      {s.venueCity} · {s.venueType}
                    </span>
                  </td>
                  <td>
                    <Capacity s={s} />
                  </td>
                  <td className={styles.cellStrong}>{formatRupiahPlain(s.price)}</td>
                  <td>
                    <Badge tone={STATUS[s.displayStatus].tone} dot>
                      {STATUS[s.displayStatus].label}
                    </Badge>
                  </td>
                  <td>
                    <span className={styles.rowActions}>
                      <Link href={`/admin/activities/${s.id}`} className={styles.iconLink} aria-label={`Edit ${s.title}`}>
                        <AdminIcon name="pencil-simple" size={18} />
                      </Link>
                      <Link href={`/admin/activities/new?from=${s.id}`} className={styles.iconLink} aria-label={`Duplikat ${s.title}`} title="Duplikat">
                        <AdminIcon name="copy" size={18} />
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
