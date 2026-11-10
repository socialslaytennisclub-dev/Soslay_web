import type { Metadata } from "next";
import Link from "next/link";
import { ExportButton } from "@/components/admin/finance/ExportDialog";
import styles from "@/components/admin/finance/Finance.module.css";
import { FinanceTabs, PageHead, SegmentLinks } from "@/components/admin/finance/FinanceUI";
import { ParamSelect } from "@/components/admin/finance/ParamSelect";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { cx } from "@/lib/cx";
import { dateLabel, monthLabel, num, pct, rp, rpShort } from "@/lib/finance/format";
import { eventReconciliation, eventRows, type EventKind } from "@/lib/finance/reports";
import { one } from "@/server/admin/query";
import { financePage, monthParam } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Laba per sesi & event" };

const KIND_LABEL: Record<EventKind, string> = { mabar: "Mabar", coaching: "Coaching", event: "Event", trip: "Trip" };
const SORTS = { profit: "Laba tertinggi", revenue: "Pendapatan tertinggi", date: "Tanggal terbaru", loss: "Rugi dulu" } as const;
type Sort = keyof typeof SORTS;

/** Admin / 12v — Laba per sesi & event + rekonsiliasi ke laba bersih bulan. */
export default async function EventProfitPage({ searchParams }: PageProps<"/admin/keuangan/event">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role } = ctx;
  const raw = await searchParams;
  const { month, months } = monthParam(data, raw.m);
  const kind = ((one(raw.kind) ?? "") in KIND_LABEL ? one(raw.kind) : "all") as EventKind | "all";
  const sort = ((one(raw.sort) ?? "profit") in SORTS ? (one(raw.sort) ?? "profit") : "profit") as Sort;
  const all = eventRows(data, month);
  const rows = all
    .filter((r) => kind === "all" || r.kind === kind)
    .sort((a, b) => (sort === "revenue" ? b.revenue - a.revenue : sort === "date" ? b.date.localeCompare(a.date) : sort === "loss" ? a.profit - b.profit : b.profit - a.profit));
  const revenue = all.reduce((s, r) => s + r.revenue, 0);
  const cost = all.reduce((s, r) => s + r.cost, 0);
  const losses = all.filter((r) => r.profit < 0).length;
  const noCost = all.filter((r) => !r.hasCost && r.revenue > 0 && r.kind !== "trip").length;
  // Biaya trip dikaitkan lewat activity trip-nya (tidak ada detail event untuk trip).
  const tripsNoCost = all.filter((r) => !r.hasCost && r.revenue > 0 && r.kind === "trip").length;
  const recon = eventReconciliation(data, month);
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ m: month, ...(kind !== "all" ? { kind } : {}), ...(sort !== "profit" ? { sort } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/admin/keuangan/event?${p.toString()}`;
  };
  const count = (k: EventKind) => all.filter((r) => r.kind === k).length;

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Per event" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          title="Laba per sesi & event"
          subtitle="Pendapatan dan biaya yang dikaitkan ke sesi, event & trip. Biaya umum tidak dibagi ke event."
          actions={
            <>
              <ParamSelect name="m" value={month} options={months} label="Periode" />
              <ExportButton month={month} preset={["transactions"]} label="Export" />
            </>
          }
        />
        <FinanceTabs active="event" role={role} query={`?m=${month}`} />

        <div className={styles.kpis}>
          <Kpi icon="tennis-ball" label="Sesi, event & trip" value={String(all.length)} note={`${losses} rugi · ${noCost + tripsNoCost} belum ada biaya terkait`} />
          <Kpi icon="trend-up" label="Pendapatan terkait" value={rpShort(revenue)} note="Tiket Kuyy, bayar manual, paket trip & sistem" />
          <Kpi icon="trend-down" label="Biaya terkait" value={rpShort(cost)} note="Sewa, honor, transport, konsumsi …" />
          <Kpi icon="money" label="Laba sesi, event & trip" value={rpShort(revenue - cost)} note={`Margin ${pct(revenue ? ((revenue - cost) / revenue) * 100 : null)}`} />
        </div>

        {noCost > 0 && (
          <p className={styles.alert}>
            <AdminIcon name="warning-circle" size={16} />
            {noCost} sesi belum punya biaya terkait (mis. sewa lapangan belum dikaitkan) — labanya bisa terlihat terlalu besar. Kaitkan dari detail transaksi atau detail event.
          </p>
        )}

        {tripsNoCost > 0 && (
          <p className={styles.alert}>
            <AdminIcon name="warning-circle" size={16} />
            {tripsNoCost} trip belum punya biaya terkait — kaitkan biaya trip (hotel, transport, makan) ke salah satu activity trip itu lewat &ldquo;Kaitkan ke sesi&rdquo; di detail transaksi.
          </p>
        )}

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.listTop}>
            <SegmentLinks
              label="Jenis"
              active={kind}
              items={[
                { key: "all", label: "Semua", href: href({ kind: undefined }), count: all.length },
                ...(Object.keys(KIND_LABEL) as EventKind[]).map((k) => ({ key: k, label: KIND_LABEL[k], href: href({ kind: k }), count: count(k) })),
              ]}
            />
            <ParamSelect name="sort" value={sort} options={(Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: `Urut: ${SORTS[k]}` }))} label="Urutan" />
          </div>
          {rows.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sesi / event / trip</th>
                    <th>Jenis</th>
                    <th className={styles.num}>Peserta</th>
                    <th className={styles.num}>Pendapatan</th>
                    <th className={styles.num}>Biaya terkait</th>
                    <th className={styles.num}>Laba</th>
                    <th className={styles.num}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <Link href={r.href} className={styles.cellTitle}>
                          {r.title} · {r.place}
                        </Link>
                        <span className={styles.cellSub}>
                          {dateLabel(r.date, false)} · {r.channel}
                        </span>
                      </td>
                      <td>
                        <span className={cx(styles.pill, r.kind === "event" || r.kind === "trip" ? styles.pillLime : r.kind === "coaching" ? styles.pillAuto : undefined)}>{KIND_LABEL[r.kind]}</span>
                      </td>
                      <td className={styles.num}>{r.participants}</td>
                      <td className={styles.num}>{num(r.revenue)}</td>
                      <td className={styles.num}>{r.hasCost ? num(r.cost) : <span className={cx(styles.pill, styles.pillPink)}>Belum ada</span>}</td>
                      <td className={cx(styles.num, styles.strong, r.profit < 0 && styles.neg)}>
                        {r.profit < 0 ? "−" : ""}
                        {num(r.profit)}
                      </td>
                      <td className={styles.num}>{r.profit < 0 ? <span className={cx(styles.pill, styles.pillPink)}>Rugi</span> : pct(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Belum ada sesi di {monthLabel(month)}</p>
              <p>Laba per event muncul setelah pendapatan / biaya dikaitkan ke sesi.</p>
            </div>
          )}
          <div className={styles.tableFoot}>
            <span>
              Menampilkan {rows.length} dari {all.length} sesi, event & trip
            </span>
          </div>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle} style={{ marginBottom: 12 }}>
            Dari laba event ke laba bersih {monthLabel(month).split(" ")[0]}
          </h3>
          <div className={styles.recon}>
            <div>
              <span>Laba dari transaksi terkait sesi, event & trip (diakui bulan ini)</span>
              <strong>{rp(recon.linkedProfit)}</strong>
            </div>
            <div>
              <span>+ Pendapatan tidak terkait sesi (sponsorship, coaching privat, merchandise, withdraw lama, …)</span>
              <strong>+{rp(recon.unlinkedRevenue)}</strong>
            </div>
            <div>
              <span>− Biaya umum tidak terkait sesi (gaji, marketing, software, penyusutan, …)</span>
              <strong className={styles.neg}>{rp(-recon.unlinkedCost)}</strong>
            </div>
            <div>
              <span className={styles.reconTotal}>Laba bersih {monthLabel(month)}</span>
              <strong className={styles.reconTotal}>{rp(recon.netProfit)}</strong>
            </div>
          </div>
          <p className={styles.muted} style={{ marginTop: 8 }}>
            Tabel di atas menjumlahkan transaksi terkait lintas bulan (mis. DP September untuk trip Oktober); rekonsiliasi memakai transaksi yang diakui di bulan ini saja.
          </p>
        </section>
      </div>
    </>
  );
}
