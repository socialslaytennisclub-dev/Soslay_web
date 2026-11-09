import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "@/components/admin/finance/Finance.module.css";
import { LinkTxButton, SyncSessionButton } from "@/components/admin/finance/LinkTx";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { RecordTxButton } from "@/components/admin/finance/TxModal";
import { TxTable } from "@/components/admin/finance/TxTable";
import { Kpi } from "@/components/admin/overview/Overview";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { dateLabel, pct, rp, rpShort } from "@/lib/finance/format";
import { posted, postedBySession } from "@/lib/finance/reports";
import { SOURCE_META } from "@/lib/finance/sources";
import { toTxViews, txFormOptions } from "@/lib/finance/views";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Detail event" };

const TERM = { dp: "DP", installment: "Cicilan", settlement: "Pelunasan" } as const;

/** Admin / 12w — Detail event: pendapatan per jalur/termin, biaya per kategori, transaksi terkait. */
export default async function EventDetailPage({ params }: PageProps<"/admin/keuangan/event/[sessionId]">) {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data, role, userId, userName } = ctx;
  const { sessionId } = await params;
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) notFound();
  const linked = postedBySession(data).get(sessionId) ?? [];
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
  for (const t of expense) byCategory.set(cat.get(t.categoryId ?? "") ?? "—", (byCategory.get(cat.get(t.categoryId ?? "") ?? "—") ?? 0) + t.amount);

  // Kandidat "Kaitkan transaksi": belum terkait, ±45 hari dari tanggal sesi.
  const start = new Date(session.startsAt).getTime();
  const candidates = posted(data)
    .filter((t) => !t.sessionId && (t.type === "income" || t.type === "expense") && Math.abs(new Date(t.date).getTime() - start) < 45 * 86_400_000)
    .slice(0, 80)
    .map((t) => ({ id: t.id, label: `${dateLabel(t.date)} · ${t.description} · ${t.type === "expense" ? "−" : "+"}${rp(t.amount)}` }));

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
          <Kpi icon="trend-up" label="Pendapatan" value={rpShort(revenue)} note={`${income.length} transaksi terkait`} />
          <Kpi icon="trend-down" label="Biaya terkait" value={rpShort(cost)} note={`${expense.length} transaksi terkait`} />
          <Kpi icon="money" label="Laba" value={rpShort(profit)} note={`Margin ${pct(revenue ? (profit / revenue) * 100 : null)}`} />
          <Kpi icon="users-three" label="Laba per peserta" value={session.participants ? rpShort(Math.round(profit / session.participants)) : "—"} note={`${session.participants} peserta`} />
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
              {!byChannel.size && <p className={styles.muted}>Belum ada pendapatan terkait.</p>}
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
              {!byCategory.size && <p className={styles.alert}>Belum ada biaya terkait — kaitkan sewa lapangan, honor, transport, konsumsi.</p>}
            </div>
          </section>
        </div>

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
