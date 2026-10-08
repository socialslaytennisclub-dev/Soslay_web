"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatRupiahPlain, TIER_LABEL } from "@/lib/admin-labels";
import type { OrderDetail } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, MemberAvatar, OrderStatusBadge, PaymentBadge } from "../ui/AdminUI";
import styles from "./Orders.module.css";

const COURIERS = ["JNE REG", "SiCepat REG", "J&T EZ", "GoSend Same Day"];
const placedFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Panel detail order (kanan di desktop, di atas daftar di HP). */
export function OrderPanel({ order, closeHref }: { order: OrderDetail; closeHref?: string }) {
  const [courier, setCourier] = useState(order.courier);
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // Di HP/tablet panel ada di atas daftar: bawa ke layar saat order dipilih.
  useEffect(() => {
    if (closeHref && window.matchMedia("(max-width: 1199px)").matches) ref.current?.scrollIntoView({ block: "start" });
  }, [closeHref, order.code]);
  const canShip = order.status === "processing" || (order.status === "pending" && order.payment === "paid");
  const waPhone = order.customerPhone.replace(/\D/g, "").replace(/^0/, "62");

  const markShipped = () => {
    if (!tracking.trim()) {
      setNotice("Isi nomor resi dulu sebelum menandai dikirim.");
      return;
    }
    setNotice("Mode demo: status belum disimpan karena database (Supabase) belum tersambung.");
  };

  return (
    <aside ref={ref} className={styles.panel} aria-label={`Detail order ${order.code}`}>
      <header className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>#{order.code}</h2>
          <p className={styles.muted}>
            {placedFmt.format(new Date(order.placedAt))} · via {order.channel.toLowerCase()}
          </p>
        </div>
        {closeHref && (
          <Link href={closeHref} scroll={false} className={styles.close} aria-label="Tutup detail">
            <AdminIcon name="x" size={18} />
          </Link>
        )}
      </header>
      <div className={styles.badges}>
        <PaymentBadge status={order.payment} />
        <span className={styles.muted}>{order.paymentMethod}</span>
        <OrderStatusBadge status={order.status} />
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Customer</h3>
        <div className={styles.customer}>
          <MemberAvatar name={order.customer} size={36} />
          <span className={styles.customerText}>
            <Link href={`/admin/members/${order.memberId}`} className={styles.strongLink}>
              {order.customer}
            </Link>
            <span className={styles.muted}>
              {TIER_LABEL[order.customerTier]} member · {order.previousOrders ? `${order.previousOrders} order sebelumnya` : "order pertama"}
            </span>
          </span>
          {waPhone && (
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className={styles.iconLink} aria-label={`WhatsApp ${order.customer}`}>
              <AdminIcon name="whatsapp-logo" size={18} />
            </a>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Produk</h3>
        {order.items.map((item) => (
          <div key={`${item.name}-${item.variant}`} className={styles.product}>
            <span className={styles.productThumb}>{item.image && <Image src={item.image} alt="" fill sizes="56px" />}</span>
            <span className={styles.customerText}>
              <span className={styles.strong}>{item.name}</span>
              <span className={styles.muted}>
                {item.variant} · ×{item.quantity}
              </span>
            </span>
            <span className={styles.strong}>{formatRupiahPlain(item.price * item.quantity)}</span>
          </div>
        ))}
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatRupiahPlain(order.subtotal)}</dd>
          </div>
          <div>
            <dt>Ongkir · {order.courier}</dt>
            <dd>{formatRupiahPlain(order.shippingCost)}</dd>
          </div>
          {order.pointsDiscount > 0 && (
            <div>
              <dt>Poin dipakai</dt>
              <dd>-{formatRupiahPlain(order.pointsDiscount)}</dd>
            </div>
          )}
          <div className={styles.grandTotal}>
            <dt>Total</dt>
            <dd>{formatRupiahPlain(order.grandTotal)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Pengiriman</h3>
        <p className={styles.address}>{order.address}</p>
        {canShip ? (
          <>
            <div className={styles.shipRow}>
              <label className={styles.shipSelect}>
                <span className="visually-hidden">Kurir</span>
                <select value={courier} onChange={(e) => setCourier(e.target.value)}>
                  {COURIERS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </label>
              <label className={styles.shipInput}>
                <span className="visually-hidden">Nomor resi</span>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="No. resi…" />
              </label>
            </div>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            <div className={styles.shipActions}>
              <AdminButton icon="download-simple" disabled title="Butuh database">
                Cetak label
              </AdminButton>
              <AdminButton variant="primary" icon="truck" onClick={markShipped}>
                Tandai dikirim
              </AdminButton>
            </div>
          </>
        ) : order.trackingNumber ? (
          <p className={styles.tracking}>
            <AdminIcon name="truck" size={16} />
            {order.courier} · <span className={styles.code}>{order.trackingNumber}</span>
          </p>
        ) : (
          <p className={styles.muted}>{order.status === "cancelled" ? "Order dibatalkan — tidak dikirim." : "Menunggu pembayaran."}</p>
        )}
      </section>
    </aside>
  );
}
