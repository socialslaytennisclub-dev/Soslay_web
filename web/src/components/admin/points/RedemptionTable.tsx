import Link from "next/link";
import { formatPoints } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { AdminRedemption } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import { desktopOnlyClass, MobileCard, MobileCardList } from "../ui/AdminUI";
import { RedemptionBadge } from "./RedemptionBadge";
import { RewardThumb } from "./RewardCatalog";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function Identity({ r }: { r: AdminRedemption }) {
  return (
    <span className={ordersStyles.customer}>
      <RewardThumb image={r.rewardImage} />
      <span className={ordersStyles.customerText}>
        <span className={ordersStyles.strong}>{r.memberName}</span>
        <span className={ordersStyles.muted}>{r.rewardName}</span>
      </span>
    </span>
  );
}

/** Antrean penukaran (Figma 317:37). `hrefFor` membuka panel lewat ?code=. */
export function RedemptionTable({ items, selected, hrefFor }: { items: AdminRedemption[]; selected?: string; hrefFor: (code: string) => string }) {
  if (items.length === 0) return <p className={ordersStyles.empty}>Tidak ada penukaran untuk status ini.</p>;

  return (
    <>
      <div className={ordersStyles.mobileList}>
        <MobileCardList label="Daftar penukaran">
          {items.map((r) => (
            <MobileCard
              key={r.code}
              href={hrefFor(r.code)}
              selected={r.code === selected}
              title={<Identity r={r} />}
              aside={<RedemptionBadge status={r.status} />}
              meta={[
                { label: "Kode", value: <span className={ordersStyles.code}>#{r.code}</span> },
                { label: "Poin", value: <span className={ordersStyles.strong}>{formatPoints(r.points)}</span> },
                { label: "Tanggal", value: <span className={ordersStyles.muted}>{when.format(new Date(r.createdAt))}</span> },
              ]}
            />
          ))}
        </MobileCardList>
      </div>

      <div className={cx(ordersStyles.tableWrap, desktopOnlyClass)}>
        <table className={ordersStyles.table}>
          <thead>
            <tr>
              <th>Penukaran</th>
              <th>Member & reward</th>
              <th>Poin</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.code} className={cx(r.code === selected && ordersStyles.rowSelected)}>
                <td>
                  <Link href={hrefFor(r.code)} scroll={false} className={ordersStyles.rowLink} aria-current={r.code === selected ? "true" : undefined}>
                    <span className={ordersStyles.code}>#{r.code}</span>
                    <span className={ordersStyles.muted}>{when.format(new Date(r.createdAt))}</span>
                  </Link>
                </td>
                <td>
                  <Identity r={r} />
                </td>
                <td className={ordersStyles.strong}>{formatPoints(r.points)}</td>
                <td>
                  <RedemptionBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
