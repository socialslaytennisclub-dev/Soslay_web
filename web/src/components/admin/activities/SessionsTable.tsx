import Link from "next/link";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { ActivityListRow, SessionRow, SessionSort } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { desktopOnlyClass, MobileCard, MobileCardList } from "../ui/AdminUI";
import styles from "./Activities.module.css";
import { CapacityBar, schedule, StatusBadge, Thumb } from "./ActivityCells";
import { TripCard, TripRows } from "./TripRows";

function Capacity({ s }: { s: SessionRow }) {
  return (
    <span className={styles.capacity}>
      <span className={styles.capacityHead}>
        <span className={styles.capacityValue}>
          {s.booked}/{s.capacity}
        </span>
        {s.waitlisted > 0 && <span className={styles.waitlist}>+{s.waitlisted} waitlist</span>}
      </span>
      <CapacityBar value={s.booked} max={s.capacity} />
    </span>
  );
}

type SessionsTableProps = {
  rows: ActivityListRow[];
  sort: SessionSort;
  dir: "asc" | "desc";
  /** URL urutan per kolom (dihitung di server, mempertahankan filter). */
  sortHrefs: Record<"title" | "schedule", string>;
};

/** Tabel Activities (Figma 25:4725) + versi kartu di HP. Kolom Sesi & Jadwal bisa diurutkan. */
export function SessionsTable({ rows, sort, dir, sortHrefs }: SessionsTableProps) {
  if (rows.length === 0) {
    return <p className={styles.empty}>Tidak ada sesi untuk filter ini.</p>;
  }

  const sortHeader = (key: "title" | "schedule", label: string) => {
    const active = sort === key;
    return (
      <Link
        href={sortHrefs[key]}
        scroll={false}
        className={cx(styles.sortLink, active && styles.sortActive)}
        aria-label={`Urutkan ${label}${active ? (dir === "asc" ? ", sekarang naik" : ", sekarang turun") : ""}`}
      >
        {label}
        <AdminIcon name={active ? (dir === "asc" ? "arrow-up" : "arrow-down") : "arrows-down-up"} size={12} />
      </Link>
    );
  };

  return (
    <>
      <MobileCardList label="Daftar sesi">
        {rows.map((r) => {
          if (r.kind === "trip") return (<li key={r.item.trip.id} className={styles.tripCardItem}><TripCard item={r.item} /></li>);
          const s = r.session;
          const when = schedule(s);
          return (
            <MobileCard
              key={s.id}
              href={`/admin/activities/${s.id}`}
              title={
                <span className={styles.sessionCell}>
                  <Thumb src={s.image} />
                  <span className={styles.sessionText}>
                    <span className={styles.sessionTitle}>{s.title}</span>
                    <span className={styles.sessionMeta}>
                      {when.date} · {when.time}
                    </span>
                  </span>
                </span>
              }
              aside={<StatusBadge status={s.displayStatus} />}
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
              <th aria-sort={sort === "title" ? (dir === "asc" ? "ascending" : "descending") : undefined}>{sortHeader("title", "Sesi")}</th>
              <th aria-sort={sort === "schedule" ? (dir === "asc" ? "ascending" : "descending") : undefined}>{sortHeader("schedule", "Jadwal")}</th>
              <th>Venue</th>
              <th>Kapasitas</th>
              <th>Harga</th>
              <th>Status</th>
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === "trip") return <TripRows key={r.item.trip.id} item={r.item} />;
              const s = r.session;
              const when = schedule(s);
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/activities/${s.id}`} className={styles.sessionCell}>
                      <Thumb src={s.image} />
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
                    <StatusBadge status={s.displayStatus} />
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
