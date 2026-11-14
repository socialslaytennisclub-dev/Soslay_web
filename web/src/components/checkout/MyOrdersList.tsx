import Image from "next/image";
import Link from "next/link";
import { fmtDateTime, fmtDayDate, fmtTime, rp, SHIPPING_LABEL } from "@/lib/checkout";
import type { MyOrderListItem } from "@/server/shop/types";
import styles from "./Checkout.module.css";
import { Card, StageChip } from "./CheckoutParts";

/** Dashboard › Order: daftar pesanan + status (aturan §13.4). Pesanan yang belum dibayar bisa dilanjutkan dari sini. */
export function MyOrdersList({ orders }: { orders: MyOrderListItem[] }) {
  if (!orders.length) return null;
  return (
    <div id="pesanan-saya" className={styles.page} style={{ background: "none", padding: 0, scrollMarginTop: "var(--nav-height)" }}>
      <Card title="Pesanan saya" aside={<span className={styles.cardAside}>{orders.length} pesanan</span>}>
        <ul className={styles.orderList}>
          {orders.map((o) => (
            <li key={o.code} className={styles.orderRow}>
              <span className={styles.thumb}>{o.image && <Image src={o.image} alt="" fill sizes="48px" />}</span>
              <Link href={`/akun/pesanan/${o.code}`} className={styles.itemText}>
                <span className={styles.itemName}>#{o.code}</span>
                <span className={styles.itemMeta}>
                  {o.summary} · {SHIPPING_LABEL[o.method].short}
                </span>
                <span className={styles.itemWeight}>
                  {o.stage === "awaiting_payment" && o.payDeadline ? `Bayar sebelum ${fmtDayDate(o.payDeadline)} · ${fmtTime(o.payDeadline)}` : fmtDateTime(o.placedAt)}
                </span>
              </Link>
              <span className={styles.orderRowRight}>
                <StageChip stage={o.stage} />
                <span className={styles.itemPrice}>{rp(o.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
