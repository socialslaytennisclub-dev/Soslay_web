import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripPayments } from "@/components/admin/activities/TripPayments";
import styles from "@/components/admin/activities/TripPayments.module.css";
import { TripTabs } from "@/components/admin/activities/TripTabs";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton, Badge } from "@/components/admin/ui/AdminUI";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { settlementDue, shortDate, todayWib, tripRange } from "@/lib/trips";
import { getDataset } from "@/server/admin/dataset";
import { getPaymentAccounts } from "@/server/admin/finance-repo";
import { getTrip, tripDisplayStatus, tripSummary } from "@/server/admin/trips-repo";
import pageStyles from "../../../../page.module.css";

export const metadata: Metadata = { title: "Peserta & pembayaran trip" };

const DAY = 86_400_000;

/** Admin / 05x-2 Trip — Peserta & pembayaran (BR-22). */
export default async function TripPaymentsPage({ params }: PageProps<"/admin/activities/trip/[id]/peserta">) {
  const { id } = await params;
  const [trip, payAccounts, d] = await Promise.all([getTrip(id), getPaymentAccounts(), getDataset()]);
  if (!trip) notFound();
  const s = tripSummary(trip);
  const today = todayWib(d.now);
  const due = settlementDue(trip.startsOn);
  const daysLeft = Math.round((Date.parse(due) - Date.parse(today)) / DAY);
  const display = tripDisplayStatus(trip, today);
  const { accounts, defaultId: defaultAccountId } = payAccounts;
  const singlesIn = trip.activities.reduce((sum, a) => sum + (a.soldSingle ? a.singles * a.price : 0), 0);

  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Activities / ${trip.title}`} title={trip.title} />
      <div className={pageStyles.content}>
        <div className={styles.bar}>
          <div className={styles.barLeft}>
            <Link href="/admin/activities" className={styles.back}>
              <AdminIcon name="caret-left" size={16} /> Activities
            </Link>
            <Badge tone="lime">Tennis Escape</Badge>
            <Badge tone={display === "published" ? "indigo" : "neutral"} dot>
              {display === "published" ? "Published" : display === "draft" ? "Draft" : display === "completed" ? "Selesai" : "Arsip"}
            </Badge>
            <span>
              {tripRange(trip.startsOn, trip.endsOn)} · {trip.activities.length} activity · pelunasan H-14: {shortDate(due)}
            </span>
          </div>
          <AdminButton href={`/admin/keuangan/transaksi?m=all&trip=${trip.id}`} icon="hand-coins">
            Lihat di Keuangan
          </AdminButton>
        </div>
        <TripTabs tripId={trip.id} active="peserta" />

        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span>Paket bundling</span>
            <strong>
              {s.sold} / {trip.packageQuota}
            </strong>
            <small>
              {s.earlyBird} early bird · {s.normal} normal
            </small>
          </div>
          <div className={styles.kpi}>
            <span>Bundling sudah masuk</span>
            <strong>{formatRupiahPlain(s.paidIn)}</strong>
            <small>
              {s.fullyPaid} lunas · {s.dp} DP
            </small>
          </div>
          <div className={cx(styles.kpi, s.outstanding > 0 && styles.kpiWarn)}>
            <span>Sisa tagihan</span>
            <strong>{formatRupiahPlain(s.outstanding)}</strong>
            <small>
              {s.unpaid} peserta · jatuh tempo {shortDate(due)}
              {daysLeft >= 0 ? ` (${daysLeft} hari)` : " (lewat)"}
            </small>
          </div>
          <div className={styles.kpi}>
            <span>Peserta satuan (Kuyy)</span>
            <strong>{s.singles}</strong>
            <small>{formatRupiahPlain(singlesIn)} · dari import Kuy</small>
          </div>
        </div>

        <TripPayments
          tripId={trip.id}
          tripTitle={trip.title}
          activities={trip.activities.length}
          quota={trip.packageQuota}
          due={shortDate(due)}
          minDp={trip.minDp}
          bookings={trip.bookings}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
        />

        <section className={styles.singles} aria-labelledby="peserta-satuan">
          <header className={styles.bar}>
            <div>
              <h2 id="peserta-satuan" className={styles.title}>
                Peserta satuan per activity (Kuyy)
              </h2>
              <p className={styles.sub}>Hanya terdaftar di activity yang dibeli. Tercatat otomatis ke Keuangan saat diimpor (akun Saldo Kuyy).</p>
            </div>
          </header>
          <div className={styles.singleGrid}>
            {trip.activities.map((a) => {
              const when = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(a.startsAt)).replace(/\./g, "");
              const quota = a.singleQuota ?? Math.max(a.capacity - a.bundled, 0);
              return (
                <Link key={a.id} href={`/admin/activities/${a.id}`} className={styles.singleCard}>
                  <strong>
                    Activity {a.tripOrder} · {a.title}
                  </strong>
                  <span>{when}</span>
                  <span className={styles.stack} aria-hidden>
                    <span style={{ width: `${Math.min(a.bundled / a.capacity, 1) * 100}%` }} />
                    <span style={{ width: `${Math.min(a.singles / a.capacity, 1) * 100}%` }} />
                  </span>
                  <span>
                    {a.booked}/{a.capacity} terisi · {a.bundled} bundling + {a.singles} satuan
                  </span>
                  {a.soldSingle ? (
                    <span className={styles.singleChip}>
                      Satuan {a.singles}/{quota} · {formatRupiahPlain(a.singles * a.price)}
                    </span>
                  ) : (
                    <span className={cx(styles.singleChip, styles.singleChipOff)}>Tidak dijual satuan</span>
                  )}
                </Link>
              );
            })}
          </div>
          <p className={styles.sub}>Import XLSX dari Kuy dilakukan per activity: buka activity › Peserta & absensi › Tambah peserta › Import XLSX.</p>
        </section>
      </div>
    </>
  );
}
