import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintOnLoad } from "@/components/admin/orders/PrintOnLoad";
import { getOrder } from "@/server/admin/orders-repo";
import styles from "./label.module.css";

export const metadata: Metadata = { title: "Label pengiriman" };

/** Label pengiriman siap cetak (A6) — dibuka dari panel order. */
export default async function OrderLabelPage({ params }: PageProps<"/admin/orders/[code]/label">) {
  const order = await getOrder((await params).code);
  if (!order) notFound();

  return (
    <div className={styles.page}>
      <PrintOnLoad />
      <article className={styles.label}>
        <header className={styles.head}>
          <strong>SOSLAY · Social Slay Tennis Club</strong>
          <span>#{order.code}</span>
        </header>
        <section>
          <p className={styles.caption}>Kepada</p>
          <p className={styles.name}>{order.customer}</p>
          <p>{order.customerPhone ? `+62 ${order.customerPhone}` : ""}</p>
          <p className={styles.address}>{order.address}</p>
        </section>
        <section className={styles.meta}>
          <span>Kurir: {order.courier || "—"}</span>
          <span>Resi: {order.trackingNumber ?? "—"}</span>
        </section>
        <section>
          <p className={styles.caption}>Isi paket</p>
          <ul>
            {order.items.map((item) => (
              <li key={`${item.name}-${item.variant}`}>
                {item.name} {item.variant && `· ${item.variant}`} ×{item.quantity}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
