"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { rupiahShort, settlementDue, shortDate, tripDays, tripRange, weekdayRange } from "@/lib/trips";
import { archiveTrip, duplicateTrip } from "@/server/admin/actions/trips";
import type { TripDetail, TripStatus, TripSummary } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { Badge, type BadgeTone } from "../ui/AdminUI";
import { useConfirm } from "../ui/ConfirmDialog";
import { RowMenu, type RowMenuItem } from "../ui/RowMenu";
import { toast } from "../ui/Toaster";
import styles from "./Activities.module.css";
import { CapacityBar, schedule, StatusBadge, Thumb } from "./ActivityCells";

export type TripListItem = { trip: TripDetail; summary: TripSummary; display: TripStatus };

const TRIP_STATUS: Record<TripStatus, { label: string; tone: BadgeTone }> = {
  published: { label: "Published", tone: "lime" },
  draft: { label: "Draft", tone: "neutral" },
  completed: { label: "Selesai", tone: "neutral" },
  cancelled: { label: "Arsip", tone: "pink" },
};

/** Menu ⋮ trip (Figma 04c-3). */
function useTripMenu(trip: TripDetail): [RowMenuItem[], React.ReactNode] {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [, start] = useTransition();
  const base = `/admin/activities/trip/${trip.id}`;
  const items: RowMenuItem[] = [
    { label: "Edit trip", icon: "pencil-simple", onSelect: () => router.push(base) },
    { label: "Peserta & pembayaran", icon: "users-three", onSelect: () => router.push(`${base}/peserta`) },
    { label: "Tambah activity", icon: "plus-bold", onSelect: () => router.push(`${base}#activities`) },
    { label: "Rundown", icon: "list-bullets", onSelect: () => router.push(`${base}#rundown`) },
    { label: "Lihat di Keuangan", icon: "hand-coins", onSelect: () => router.push(`/admin/keuangan/transaksi?m=all&trip=${trip.id}`) },
    { label: "Pratinjau halaman member", icon: "eye", onSelect: () => window.open(`/akun/trip/${trip.slug}`, "_blank", "noopener") },
    {
      label: "Duplikat trip",
      icon: "copy",
      onSelect: () =>
        start(async () => {
          const r = await duplicateTrip(trip.id);
          toast.result(r);
          if (r.ok && r.id) router.push(`/admin/activities/trip/${r.id}`);
        }),
    },
  ];
  if (trip.status !== "cancelled") {
    items.push({
      label: "Arsipkan trip",
      icon: "trash",
      danger: true,
      onSelect: async () => {
        const ok = await confirm({
          title: `Arsipkan ${trip.title}?`,
          body: <p>Trip disembunyikan dari website & My Activities, activity yang belum mulai kembali jadi Draft. Peserta dan pembayaran tetap tersimpan — publikasikan lagi untuk menampilkannya.</p>,
          confirmLabel: "Arsipkan trip",
        });
        if (!ok) return;
        start(async () => {
          const r = await archiveTrip(trip.id);
          toast.result(r);
          if (r.ok) router.refresh();
        });
      },
    });
  }
  return [items, dialog];
}

/** Baris induk trip + baris activity per lapangan (Figma 04c / 04c-2). Klik panah = buka/tutup. */
export function TripRows({ item }: { item: TripListItem }) {
  const { trip, summary, display } = item;
  const [open, setOpen] = useState(true);
  const [menu, dialog] = useTripMenu(trip);
  const status = TRIP_STATUS[display];
  return (
    <>
      <tr className={styles.tripRow}>
        <td>
          <span className={styles.sessionCell}>
            <button type="button" className={styles.tripToggle} aria-expanded={open} aria-label={open ? `Ciutkan activity ${trip.title}` : `Tampilkan activity ${trip.title}`} onClick={() => setOpen((v) => !v)}>
              <AdminIcon name="caret-down" size={16} className={open ? undefined : styles.caretClosed} />
            </button>
            <Link href={`/admin/activities/trip/${trip.id}`} className={styles.sessionCell}>
              <Thumb src={trip.image} />
              <span className={styles.sessionText}>
                <span className={styles.sessionTitle}>{trip.title}</span>
                <span className={styles.sessionMeta}>
                  <span className={styles.tripChip}>TRIP</span> {trip.activities.length} activity
                </span>
              </span>
            </Link>
          </span>
        </td>
        <td>
          <span className={styles.cellStrong}>
            {weekdayRange(trip.startsOn, trip.endsOn)}, {tripRange(trip.startsOn, trip.endsOn, false)}
          </span>
          <span className={styles.sessionMeta}>
            {tripDays(trip.startsOn, trip.endsOn)} hari · lunas H-14: {shortDate(settlementDue(trip.startsOn))}
          </span>
        </td>
        <td>
          <span className={styles.cellName}>{summary.venues} venue</span>
          <span className={styles.sessionMeta}>{trip.area || "—"}</span>
        </td>
        <td>
          <span className={styles.capacity}>
            <span className={styles.capacityHead}>
              <span className={styles.capacityValue}>
                {summary.sold}/{trip.packageQuota} paket
              </span>
              {summary.singles > 0 && <span className={styles.waitlist}>+{summary.singles} satuan</span>}
            </span>
            <CapacityBar value={summary.sold} max={trip.packageQuota} />
          </span>
        </td>
        <td>
          <span className={styles.cellStrong}>{formatRupiahPlain(trip.priceNormal)}</span>
          {trip.priceEarlyBird !== null && <span className={styles.sessionMeta}>EB {rupiahShort(trip.priceEarlyBird)}</span>}
        </td>
        <td>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {summary.unpaid > 0 && <span className={styles.unpaidNote}>{summary.unpaid} belum lunas</span>}
        </td>
        <td>
          <RowMenu label={`Aksi ${trip.title}`} items={menu} />
          {dialog}
        </td>
      </tr>
      {open &&
        trip.activities.map((a, i) => {
          const w = schedule(a);
          const last = i === trip.activities.length - 1;
          return (
            <tr key={a.id} className={cx(styles.tripChild, last && styles.tripChildLast)}>
              <td>
                <Link href={`/admin/activities/${a.id}`} className={cx(styles.sessionCell, styles.tripChildCell)}>
                  <Thumb src={a.image} />
                  <span className={styles.sessionText}>
                    <span className={styles.sessionTitle}>{a.title}</span>
                    <span className={styles.sessionMeta}>
                      Activity {a.tripOrder} · {a.typeLabel}
                    </span>
                  </span>
                </Link>
              </td>
              <td>
                <span className={styles.cellStrong}>{w.date}</span>
                <span className={styles.sessionMeta}>{w.time}</span>
              </td>
              <td>
                <span className={styles.cellName}>{a.venueName}</span>
                <span className={styles.sessionMeta}>{a.venueCity}</span>
              </td>
              <td>
                <span className={styles.capacity}>
                  <span className={styles.capacityHead}>
                    <span className={styles.capacityValue}>
                      {a.booked}/{a.capacity}
                    </span>
                    <span className={styles.waitlist}>
                      {a.bundled} paket{a.soldSingle ? ` + ${a.singles} satuan` : ""}
                    </span>
                  </span>
                  <CapacityBar value={a.booked} max={a.capacity} />
                </span>
              </td>
              <td>
                {a.soldSingle ? (
                  <>
                    <span className={styles.cellStrong}>{formatRupiahPlain(a.price)}</span>
                    <span className={styles.sessionMeta}>Satuan · Kuyy</span>
                  </>
                ) : (
                  <>
                    <span className={styles.cellStrong}>—</span>
                    <span className={styles.sessionMeta}>Paket saja</span>
                  </>
                )}
              </td>
              <td>
                <StatusBadge status={a.displayStatus} />
              </td>
              <td>
                <Link href={`/admin/activities/${a.id}`} className={styles.iconLink} aria-label={`Edit ${a.title}`}>
                  <AdminIcon name="pencil-simple" size={18} />
                </Link>
              </td>
            </tr>
          );
        })}
    </>
  );
}

/** Kartu trip di HP (Figma MA-01t): ringkasan Paket / Satuan / Belum lunas + activity yang bisa diciutkan. */
export function TripCard({ item }: { item: TripListItem }) {
  const { trip, summary } = item;
  const [open, setOpen] = useState(true);
  const [menu, dialog] = useTripMenu(trip);
  const due = shortDate(settlementDue(trip.startsOn));
  return (
    <article className={styles.tripCard}>
      <header className={styles.tripCardHead}>
        <Thumb src={trip.image} />
        <span className={styles.sessionText}>
          <span className={styles.sessionMeta}>
            <span className={styles.tripChip}>TRIP</span> Tennis Escape · {trip.activities.length} activity
          </span>
          <Link href={`/admin/activities/trip/${trip.id}`} className={styles.tripCardTitle}>
            {trip.title}
          </Link>
        </span>
        <RowMenu label={`Aksi ${trip.title}`} items={menu} />
        {dialog}
      </header>
      <p className={styles.tripCardWhen}>
        {weekdayRange(trip.startsOn, trip.endsOn)}, {tripRange(trip.startsOn, trip.endsOn, false)} · pelunasan H-14: {due}
        <span className={styles.sessionMeta}>{trip.area}</span>
      </p>
      <div className={styles.tripStats}>
        <span>
          <small>Paket</small>
          <strong>
            {summary.sold}/{trip.packageQuota}
          </strong>
          {trip.priceEarlyBird !== null && <small>EB {rupiahShort(trip.priceEarlyBird)}</small>}
        </span>
        <span>
          <small>Satuan</small>
          <strong>{summary.singles}</strong>
          <small>via Kuyy</small>
        </span>
        <span>
          <small>Belum lunas</small>
          <strong className={summary.unpaid ? styles.unpaidValue : undefined}>{summary.unpaid}</strong>
          <small>jt. {due}</small>
        </span>
      </div>
      <button type="button" className={styles.tripCardToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <AdminIcon name="caret-down" size={14} className={open ? undefined : styles.caretClosed} />
        {open ? "Sembunyikan" : "Tampilkan"} {trip.activities.length} activity
      </button>
      {open && (
        <ol className={styles.tripCardList}>
          {trip.activities.map((a) => {
            const w = schedule(a);
            const full = a.booked >= a.capacity;
            return (
              <li key={a.id}>
                <Link href={`/admin/activities/${a.id}`}>
                  <span className={styles.tripNumber}>{a.tripOrder}</span>
                  <span className={styles.sessionText}>
                    <span className={styles.sessionTitle}>{a.title}</span>
                    <span className={styles.sessionMeta}>
                      {w.date} · {w.time.split("–")[0]} · {a.soldSingle ? rupiahShort(a.price) : "Paket saja"}
                    </span>
                  </span>
                  <span className={cx(styles.tripPill, full && styles.tripPillFull)}>
                    {a.booked}/{a.capacity}
                  </span>
                  <AdminIcon name="caret-right" size={14} />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <Link href={`/admin/activities/trip/${trip.id}/peserta`} className={styles.tripCardCta}>
        <AdminIcon name="users-three" size={18} /> Peserta & pembayaran
      </Link>
    </article>
  );
}
