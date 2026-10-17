import Link from "next/link";
import { formatPoints, POINTS_REASON_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { LedgerEntry, PointsReason } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import { Badge, desktopOnlyClass, MobileCard, MobileCardList, type BadgeTone } from "../ui/AdminUI";
import styles from "./Points.module.css";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const TONE: Record<PointsReason, BadgeTone> = { attendance: "indigo", purchase: "lime", bonus: "pink", redeem: "navy", adjustment: "neutral" };

function Delta({ n }: { n: number }) {
  return <span className={cx(ordersStyles.strong, n > 0 ? styles.plus : styles.minus)}>{formatPoints(n, true)}</span>;
}

/** Riwayat poin semua member (Figma 322:2 bawah). */
export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <p className={ordersStyles.empty}>Belum ada transaksi poin untuk filter ini.</p>;

  return (
    <>
      <div className={ordersStyles.mobileList}>
        <MobileCardList label="Riwayat poin">
          {entries.map((e) => (
            <MobileCard
              key={e.id}
              href={`/admin/members/${e.memberId}`}
              title={
                <span className={ordersStyles.customerText}>
                  <span className={ordersStyles.strong}>{e.memberName}</span>
                  <span className={ordersStyles.muted}>{e.note || POINTS_REASON_LABEL[e.reason]}</span>
                </span>
              }
              aside={<Delta n={e.delta} />}
              meta={[
                { label: "Alasan", value: <Badge tone={TONE[e.reason]} dot>{POINTS_REASON_LABEL[e.reason]}</Badge> },
                { label: "Saldo", value: <span className={ordersStyles.strong}>{e.balanceAfter.toLocaleString("id-ID")}</span> },
                { label: "Tanggal", value: <span className={ordersStyles.muted}>{when.format(new Date(e.at))}</span> },
              ]}
            />
          ))}
        </MobileCardList>
      </div>

      <div className={cx(ordersStyles.tableWrap, desktopOnlyClass)}>
        <table className={ordersStyles.table}>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Member</th>
              <th>Alasan</th>
              <th>Keterangan</th>
              <th className={styles.right}>Poin</th>
              <th className={styles.right}>Saldo</th>
              <th>Oleh</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className={ordersStyles.customerText}>
                    <span className={ordersStyles.strong}>{when.format(new Date(e.at))}</span>
                    <span className={ordersStyles.muted}>{time.format(new Date(e.at))}</span>
                  </span>
                </td>
                <td>
                  <Link href={`/admin/members/${e.memberId}`} className={ordersStyles.customerText}>
                    <span className={ordersStyles.strongLink}>{e.memberName}</span>
                    <span className={ordersStyles.muted}>{TIER_LABEL[e.memberTier]}</span>
                  </Link>
                </td>
                <td>
                  <Badge tone={TONE[e.reason]} dot>
                    {POINTS_REASON_LABEL[e.reason]}
                  </Badge>
                </td>
                <td>{e.note}</td>
                <td className={styles.right}>
                  <Delta n={e.delta} />
                </td>
                <td className={cx(ordersStyles.strong, styles.right)}>{e.balanceAfter.toLocaleString("id-ID")}</td>
                <td className={ordersStyles.muted}>{e.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
