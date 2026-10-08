import Image from "next/image";
import Link from "next/link";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { OrderListItem } from "@/server/admin/types";
import { desktopOnlyClass, MobileCard, MobileCardList, OrderStatusBadge, PaymentBadge } from "../ui/AdminUI";
import styles from "./Orders.module.css";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const placed = (iso: string) => when.format(new Date(iso));

function Customer({ o }: { o: OrderListItem }) {
  return (
    <span className={styles.customer}>
      <span className={styles.thumb}>{o.image && <Image src={o.image} alt="" fill sizes="40px" />}</span>
      <span className={styles.customerText}>
        <span className={styles.strong}>{o.customer}</span>
        <span className={styles.muted}>{o.summary}</span>
      </span>
    </span>
  );
}

/** Daftar order (Figma 25:5560). `hrefFor` membuka panel detail lewat ?order=. */
export function OrdersTable({ items, selected, auto, hrefFor }: { items: OrderListItem[]; selected?: string; auto?: boolean; hrefFor: (code: string) => string }) {
  if (items.length === 0) return <p className={styles.empty}>Tidak ada order untuk filter ini.</p>;

  return (
    <>
      <div className={styles.mobileList}>
        <MobileCardList label="Daftar order">
          {items.map((o) => (
            <MobileCard
              key={o.code}
              href={hrefFor(o.code)}
              selected={!auto && o.code === selected}
              title={<Customer o={o} />}
              aside={<OrderStatusBadge status={o.status} />}
              meta={[
                { label: "Order", value: <span className={styles.code}>#{o.code}</span> },
                { label: "Total", value: <span className={styles.strong}>{formatRupiahPlain(o.total)}</span> },
                { label: "Bayar", value: <PaymentBadge status={o.payment} /> },
              ]}
            />
          ))}
        </MobileCardList>
      </div>

      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer & produk</th>
              <th>Total</th>
              <th>Bayar</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.code} className={cx(o.code === selected && (auto ? styles.rowAuto : styles.rowSelected))}>
                <td>
                  <Link href={hrefFor(o.code)} scroll={false} className={styles.rowLink} aria-current={o.code === selected ? "true" : undefined}>
                    <span className={styles.code}>#{o.code}</span>
                    <span className={styles.muted}>{placed(o.placedAt)}</span>
                  </Link>
                </td>
                <td>
                  <Customer o={o} />
                </td>
                <td className={styles.strong}>{formatRupiahPlain(o.total)}</td>
                <td>
                  <PaymentBadge status={o.payment} />
                </td>
                <td>
                  <OrderStatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
