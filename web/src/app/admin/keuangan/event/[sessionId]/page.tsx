import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "@/components/admin/finance/Finance.module.css";
import { LinkTxButton, SyncSessionButton } from "@/components/admin/finance/LinkTx";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { LinkedBreakdown } from "@/components/admin/finance/LinkedBreakdown";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { dateLabel, pct, rpShort } from "@/lib/finance/format";
import { postedBySession, tally } from "@/lib/finance/reports";
import { linkCandidates, toTxViews, txFormOptions } from "@/lib/finance/views";
import { addDays } from "@/lib/trips";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Detail event" };

/** Admin / 12w — Detail event: pendapatan per jalur/termin, biaya per kategori, transaksi terkait. */
export default async function EventDetailPage({ params }: PageProps<"/admin/keuangan/event/[sessionId]">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const { sessionId } = await params;
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) notFound();
  const linked = postedBySession(data).get(sessionId) ?? [];
  const { revenue, cost, profit, margin } = tally(data, linked);
  const incomeCount = linked.filter((t) => t.type === "income").length;
  const expenseCount = linked.filter((t) => t.type === "expense").length;

  // Kandidat "Kaitkan transaksi": belum terkait, ±45 hari dari tanggal sesi.
  const day = session.startsAt.slice(0, 10);
  const candidates = linkCandidates(data, addDays(day, -45), addDays(day, 45), day, 80);

  const options = txFormOptions(data, role, userName);

  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Per event / Detail" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead
          back={{ href: `/admin/keuangan/event?m=${session.startsAt.slice(0, 7)}`, label: "Laba per sesi & event" }}
          title={`${session.title} · ${session.venueName}`}
          subtitle={`${dateLabel(session.startsAt.slice(0, 10))} · ${session.typeLabel} · ${session.participants} peserta`}
          actions={
            <>
              <SyncSessionButton sessionId={sessionId} />
              <LinkTxButton sessionId={sessionId} candidates={candidates} />
              <RecordTxButton options={options} label="Catat pengeluaran event" presetSessionId={sessionId} />
            </>
          }
        />
        <div className={styles.kpis}>
          <Kpi icon="trend-up" label="Pendapatan" value={rpShort(revenue)} note={`${incomeCount} transaksi terkait`} />
          <Kpi icon="trend-down" label="Biaya terkait" value={rpShort(cost)} note={`${expenseCount} transaksi terkait`} />
          <Kpi icon="money" label="Laba" value={rpShort(profit)} note={`Margin ${pct(margin)}`} />
          <Kpi icon="users-three" label="Laba per peserta" value={session.participants ? rpShort(Math.round(profit / session.participants)) : "—"} note={`${session.participants} peserta`} />
        </div>

        <LinkedBreakdown data={data} linked={linked} emptyIncome="Belum ada pendapatan terkait." emptyCost="Belum ada biaya terkait — kaitkan sewa lapangan, honor, transport, konsumsi." />

        <section className={cx(styles.panel, styles.panelFlush)}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Transaksi terkait</h3>
              <p className={styles.panelSub}>Semua bulan — termasuk DP & pelunasan</p>
            </div>
          </div>
          {linked.length ? <TxTable rows={toTxViews(data, linked, role, userId)} options={options} /> : <p className={styles.empty}>Belum ada transaksi terkait sesi ini.</p>}
        </section>
      </div>
    </>
  );
}
