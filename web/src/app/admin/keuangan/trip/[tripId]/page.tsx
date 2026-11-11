import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/admin/finance/Finance.module.css";
import { LinkTxButton, SyncTripButton } from "@/components/admin/finance/LinkTx";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { dateLabel, pct, rp, rpShort } from "@/lib/finance/format";
import { posted, postedByTrip } from "@/lib/finance/reports";
import { SOURCE_META } from "@/lib/finance/sources";
import { toTxViews, txFormOptions } from "@/lib/finance/views";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Detail trip" };

const TERM = { dp: "DP", installment: "Cicilan", settlement: "Pelunasan" } as const;
const DAY = 86_400_000;

/**
 * Detail trip di Keuangan (pola sama dengan detail event 12w): pembayaran paket (transaksi trip_id) + transaksi
 * yang dikaitkan ke activity trip itu — angka sama dengan baris Trip di Per event. Biaya trip (hotel, transport,
 * makan) dikaitkan langsung ke trip lewat "Kaitkan transaksi" / "Catat pengeluaran trip".
 */
export default async function TripFinancePage({ params }: PageProps<"/admin/keuangan/trip/[tripId]">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const { tripId } = await params;
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) notFound();
  const activities = data.sessions.filter((s) => s.tripId === tripId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const linked = postedByTrip(data).get(tripId) ?? [];
  const income = linked.filter((t) => t.type === "income");
  const expense = linked.filter((t) => t.type === "expense");
  const revenue = income.reduce((s, t) => s + t.amount, 0);
  const cost = expense.reduce((s, t) => s + t.amount, 0);
  const profit = revenue - cost;
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));

  const byChannel = new Map<string, number>();
  for (const t of income) {
    const channel = SOURCE_META[t.source].channel;
    const key = t.term ? `${channel} · ${TERM[t.term]}` : channel;
    byChannel.set(key, (byChannel.get(key) ?? 0) + t.amount);
  }
  const byCategory = new Map<string, number>();
  for (const t of expense) {
    const name = cat.get(t.categoryId ?? "") ?? "—";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
  }
  // Per activity trip: transaksi yang dikaitkan ke activity itu (tiket satuan Kuyy, sewa lapangan…).
  const perActivity = activities.map((s) => {
    const txs = linked.filter((t) => t.sessionId === s.id);
    const rev = txs.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const cst = txs.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    return { s, rev, cst };
  });
  // Langsung ke trip (tanpa activity): pembayaran paket + transaksi yang dikaitkan ke trip.
  const packageIncome = income.filter((t) => !t.sessionId).reduce((s, t) => s + t.amount, 0);
  const tripCost = expense.filter((t) => !t.sessionId).reduce((s, t) => s + t.amount, 0);

  // Kandidat "Kaitkan transaksi": belum terkait sesi / trip, 120 hari sebelum trip (DP, booking hotel) s.d. 45 hari sesudahnya.
  const start = new Date(trip.startsOn).getTime();
  const end = new Date(trip.endsOn).getTime();
  const candidates = posted(data)
    .filter((t) => !t.sessionId && !t.tripId && (t.type === "income" || t.type === "expense"))
    .filter((t) => {
      const d = new Date(t.date).getTime();
      return d >= start - 120 * DAY && d <= end + 45 * DAY;
    })
    .slice(0, 120)
    .map((t) => ({ id: t.id, label: `${dateLabel(t.date)} · ${t.description} · ${t.type === "expense" ? "−" : "+"}${rp(t.amount)}` }));

  const options = txFormOptions(data, role, userName);
  const range = trip.startsOn === trip.endsOn ? dateLabel(trip.startsOn) : `${dateLabel(trip.startsOn, false)} – ${dateLabel(trip.endsOn)}`;

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
          <Kpi icon="trend-up" label="Pendapatan" value={rpShort(revenue)} note={`${income.length} transaksi terkait`} />
          <Kpi icon="trend-down" label="Biaya terkait" value={rpShort(cost)} note={`${expense.length} transaksi terkait`} />
          <Kpi icon="money" label="Laba" value={rpShort(profit)} note={`Margin ${pct(revenue ? (profit / revenue) * 100 : null)}`} />
          <Kpi icon="users-three" label="Laba per paket" value={trip.packages ? rpShort(Math.round(profit / trip.packages)) : "—"} note={`${trip.packages} paket`} />
        </div>

        <div className={styles.gridHalf}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>
              Pendapatan per jalur / termin
            </h3>
            <div className={styles.bars}>
              {[...byChannel].map(([k, v]) => (
                <div key={k} className={styles.barRow} style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>{k}</span>
                  <strong>{rp(v)}</strong>
                  <span className={styles.track}>
                    <span className={styles.fill} style={{ display: "block", width: `${revenue ? (v / revenue) * 100 : 0}%` }} />
                  </span>
                </div>
              ))}
              {!byChannel.size && <p className={styles.muted}>Belum ada pendapatan terkait. Klik Sync untuk mencatat pembayaran paket.</p>}
            </div>
          </section>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>
              Biaya per kategori
            </h3>
            <div className={styles.bars}>
              {[...byCategory].map(([k, v]) => (
                <div key={k} className={styles.barRow} style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>{k}</span>
                  <strong>{rp(v)}</strong>
                  <span className={styles.track}>
                    <span className={cx(styles.fill, styles.fillNavy)} style={{ display: "block", width: `${cost ? (v / cost) * 100 : 0}%` }} />
                  </span>
                </div>
              ))}
              {!byCategory.size && <p className={styles.alert}>Belum ada biaya terkait — kaitkan hotel, transport, makan, sewa lapangan lewat &ldquo;Kaitkan transaksi&rdquo;.</p>}
            </div>
          </section>
        </div>

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
                  <td className={cx(styles.num, styles.strong, packageIncome - tripCost < 0 && styles.neg)}>{rp(packageIncome - tripCost)}</td>
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
