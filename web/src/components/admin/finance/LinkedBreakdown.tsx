import { cx } from "@/lib/cx";
import { rp } from "@/lib/finance/format";
import { SOURCE_META } from "@/lib/finance/sources";
import type { FinanceData, FinTx } from "@/lib/finance/types";
import { PAYMENT_KIND_LABEL } from "@/lib/trips";
import styles from "./Finance.module.css";

/** Panel "Pendapatan per jalur / termin" + "Biaya per kategori" — detail event (12w) & detail trip. */
export function LinkedBreakdown({ data, linked, emptyIncome, emptyCost }: { data: FinanceData; linked: FinTx[]; emptyIncome: string; emptyCost: string }) {
  const income = linked.filter((t) => t.type === "income");
  const expense = linked.filter((t) => t.type === "expense");
  const revenue = income.reduce((s, t) => s + t.amount, 0);
  const cost = expense.reduce((s, t) => s + t.amount, 0);
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const byChannel = new Map<string, number>();
  for (const t of income) {
    const channel = SOURCE_META[t.source].channel;
    const key = t.term ? `${channel} · ${PAYMENT_KIND_LABEL[t.term]}` : channel;
    byChannel.set(key, (byChannel.get(key) ?? 0) + t.amount);
  }
  const byCategory = new Map<string, number>();
  for (const t of expense) {
    const name = cat.get(t.categoryId ?? "") ?? "—";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
  }
  const panel = (title: string, rows: Map<string, number>, total: number, navy: boolean, empty: string, alert: boolean) => (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>
        {title}
      </h3>
      <div className={styles.bars}>
        {[...rows].map(([k, v]) => (
          <div key={k} className={styles.barRow} style={{ gridTemplateColumns: "1fr auto" }}>
            <span>{k}</span>
            <strong>{rp(v)}</strong>
            <span className={styles.track}>
              <span className={cx(styles.fill, navy && styles.fillNavy)} style={{ display: "block", width: `${total ? (v / total) * 100 : 0}%` }} />
            </span>
          </div>
        ))}
        {!rows.size && <p className={alert ? styles.alert : styles.muted}>{empty}</p>}
      </div>
    </section>
  );
  return (
    <div className={styles.gridHalf}>
      {panel("Pendapatan per jalur / termin", byChannel, revenue, false, emptyIncome, false)}
      {panel("Biaya per kategori", byCategory, cost, true, emptyCost, true)}
    </div>
  );
}
