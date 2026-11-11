import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import styles from "@/components/admin/finance/Finance.module.css";
import { LinkTxButton, SyncTripButton } from "@/components/admin/finance/LinkTx";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { LinkedBreakdown } from "@/components/admin/finance/LinkedBreakdown";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { dateLabel, pct, rp, rpShort } from "@/lib/finance/format";
import { postedByTrip, tally } from "@/lib/finance/reports";
import { linkCandidates, toTxViews, txFormOptions } from "@/lib/finance/views";
import { addDays, tripRange } from "@/lib/trips";
import { financePage } from "@/server/admin/finance-page";
import { getFinanceAccess } from "@/server/admin/finance-repo";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Detail trip" };

/**
 * Detail trip di Keuangan (pola sama dengan detail event 12w): pembayaran paket (transaksi trip_id) + transaksi
 * yang dikaitkan ke activity trip itu — angka sama dengan baris Trip di Per event. Biaya trip (hotel, transport,
 * makan) dikaitkan langsung ke trip lewat "Kaitkan transaksi" / "Catat pengeluaran trip".
 */
export default async function TripFinancePage({ params }: PageProps<"/admin/keuangan/trip/[tripId]">) {
  const { tripId } = await params;
  // Pencatat keuangan tidak punya halaman laba: ke daftar pembayaran paket trip ini (seperti dulu).
  if ((await getFinanceAccess()).role === "recorder") redirect(`/admin/keuangan/transaksi?m=all&trip=${tripId}`);
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) notFound();
  const activities = data.sessions.filter((s) => s.tripId === tripId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const linked = postedByTrip(data).get(tripId) ?? [];
  // Sama dengan baris Trip di Per event (tally).
  const { revenue, cost, profit, margin } = tally(data, linked);
  const incomeCount = linked.filter((t) => t.type === "income").length;
  const expenseCount = linked.filter((t) => t.type === "expense").length;

  // Satu kali lewat: per activity trip (tiket satuan Kuyy, sewa lapangan…) & langsung ke trip ("" = pembayaran
  // paket + biaya yang dikaitkan ke trip).
  const parts = new Map<string, { rev: number; cst: number }>();
  for (const t of linked) {
    const key = t.sessionId ?? "";
    const part = parts.get(key) ?? { rev: 0, cst: 0 };
    if (t.type === "income") part.rev += t.amount;
    if (t.type === "expense") part.cst += t.amount;
    parts.set(key, part);
  }
  const perActivity = activities.map((s) => ({ s, ...(parts.get(s.id) ?? { rev: 0, cst: 0 }) }));
  const { rev: packageIncome, cst: tripCost } = parts.get("") ?? { rev: 0, cst: 0 };
  const packageProfit = packageIncome - tripCost;

  // Kandidat "Kaitkan transaksi": 120 hari sebelum trip (DP, booking hotel) s.d. 45 hari sesudahnya.
  const candidates = linkCandidates(data, addDays(trip.startsOn, -120), addDays(trip.endsOn, 45), trip.startsOn, 120);

  const options = txFormOptions(data, role, userName);
  const range = tripRange(trip.startsOn, trip.endsOn);

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Per event / Trip" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          back={{ href: `/admin/keuangan/event?m=${trip.startsOn.slice(0, 7)}&kind=trip`, label: "Laba per sesi & event" }}
          title={trip.title}
          subtitle={`${range} · Trip · ${activities.length} activity · ${trip.packages} paket`}
          actions={
            <>
              <SyncTripButton tripId={tripId} />
              <LinkTxButton tripId={tripId} candidates={candidates} />
              <RecordTxButton options={options} label="Catat pengeluaran trip" presetTripId={tripId} />
            </>
          }
        />
        <div className={styles.kpis}>
          <Kpi icon="trend-up" label="Pendapatan" value={rpShort(revenue)} note={`${incomeCount} transaksi · ${rp(revenue)}`} />
          <Kpi icon="trend-down" label="Biaya terkait" value={rpShort(cost)} note={`${expenseCount} transaksi · ${rp(cost)}`} />
          <Kpi icon="money" label="Laba" value={rpShort(profit)} note={`Margin ${pct(margin)}`} />
          {/* Hanya bagian paket (pembayaran paket − biaya trip langsung): tiket satuan activity tidak ikut dibagi per paket. */}
          <Kpi icon="users-three" label="Laba per paket" value={trip.packages ? rpShort(Math.round(packageProfit / trip.packages)) : "—"} note={`${trip.packages} paket · tanpa tiket satuan activity`} />
        </div>

        <LinkedBreakdown data={data} linked={linked} emptyIncome="Belum ada pendapatan terkait. Klik Sync untuk mencatat pembayaran paket." emptyCost="Belum ada biaya terkait — kaitkan hotel, transport, makan, sewa lapangan lewat Kaitkan transaksi." />

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Rincian trip</h3>
              <p className={styles.panelSub}>Paket bundling, biaya trip langsung & per activity</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Bagian</th>
                  <th className={styles.num}>Pendapatan</th>
                  <th className={styles.num}>Biaya</th>
                  <th className={styles.num}>Laba</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className={styles.cellTitle}>Paket bundling & biaya trip</span>
                    <span className={styles.cellSub}>
                      {trip.packages} paket · biaya yang dikaitkan langsung ke trip
                    </span>
                  </td>
                  <td className={styles.num}>{rp(packageIncome)}</td>
                  <td className={styles.num}>{rp(tripCost)}</td>
                  <td className={cx(styles.num, styles.strong, packageProfit < 0 && styles.neg)}>{rp(packageProfit)}</td>
                </tr>
                {perActivity.map(({ s, rev, cst }) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/keuangan/event/${s.id}`} className={styles.cellTitle}>
                        {s.title} · {s.venueName}
                      </Link>
                      <span className={styles.cellSub}>
                        {dateLabel(s.startsAt.slice(0, 10), false)} · {s.participants} peserta
                      </span>
                    </td>
                    <td className={styles.num}>{rp(rev)}</td>
                    <td className={styles.num}>{rp(cst)}</td>
                    <td className={cx(styles.num, styles.strong, rev - cst < 0 && styles.neg)}>{rp(rev - cst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Transaksi terkait</h3>
              <p className={styles.panelSub}>Semua bulan — termasuk DP & pelunasan paket dan transaksi activity trip</p>
            </div>
          </div>
          {linked.length ? <TxTable rows={toTxViews(data, linked, role, userId)} options={options} /> : <p className={styles.empty}>Belum ada transaksi terkait trip ini.</p>}
        </section>
      </div>
    </>
  );
}
