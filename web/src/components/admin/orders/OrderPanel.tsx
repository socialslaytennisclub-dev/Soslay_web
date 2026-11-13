"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatRupiahPlain, TIER_LABEL } from "@/lib/admin-labels";
import { fmtDate, fmtDayDate, fmtTime, MAX_REJECTIONS, REJECT_REASONS, SHIPPING_LABEL, STAGE, type StageTone } from "@/lib/checkout";
import { reviewPayment, updateOrder, type OrderUpdate } from "@/server/admin/actions/orders";
import type { OrderDetail } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, MemberAvatar, OrderStatusBadge, PaymentBadge, type BadgeTone } from "../ui/AdminUI";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import styles from "./Orders.module.css";
import { toast } from "../ui/Toaster";

const COURIERS = ["JNE REG", "SiCepat REG", "J&T EZ", "GoSend Same Day"];
const INSTANT_COURIERS = ["GoSend", "GrabExpress"];
const placedFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const STAGE_BADGE: Record<StageTone, BadgeTone> = { amber: "neutral", indigo: "indigo", red: "pink", lime: "lime", green: "lime", neutral: "neutral" };

const ago = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} menit lalu` : min < 60 * 24 ? `${Math.floor(min / 60)} jam lalu` : `${Math.floor(min / 1440)} hari lalu`;
};

/** Panel detail order (kanan di desktop, di atas daftar di HP). Order checkout website: verifikasi transfer (ADM-03). */
export function OrderPanel({ order, closeHref }: { order: OrderDetail; closeHref?: string }) {
  const shop = order.shop;
  const method = shop?.method ?? null;
  const [courier, setCourier] = useState(order.courier && order.courier !== "Instant" ? order.courier : method === "instant" ? INSTANT_COURIERS[0] : method === "jnt" ? "J&T Express Reguler" : COURIERS[0]);
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(shop?.trackingUrl ?? "");
  const [funds, setFunds] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [saving, start] = useTransition();
  const ref = useRef<HTMLElement>(null);

  // Di HP/tablet panel ada di atas daftar: bawa ke layar saat order dipilih.
  useEffect(() => {
    if (closeHref && window.matchMedia("(max-width: 1199px)").matches) ref.current?.scrollIntoView({ block: "start" });
  }, [closeHref, order.code]);
  const canShip = order.status === "processing" || (order.status === "pending" && order.payment === "paid");
  const waPhone = order.customerPhone.replace(/\D/g, "").replace(/^0/, "62");
  const proof = shop?.proofs.find((p) => p.status === "pending");

  const run = (update: OrderUpdate, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const result = await updateOrder(order.code, update);
      toast.result(result);
    });
  };
  const cancel = () => {
    const reason = window.prompt(`Alasan membatalkan order #${order.code}?${order.payment === "paid" ? " (Sudah lunas → refund manual & koreksi Keuangan.)" : ""}`);
    if (reason?.trim()) run({ action: "cancel", reason });
  };
  const markShipped = () => {
    if (method === "instant") {
      if (!courier.trim()) return toast.error("Isi nama kurir (GoSend / GrabExpress).");
      return run({ action: "ship", courier, tracking, trackingUrl });
    }
    if (!tracking.trim()) {
      toast.error("Isi nomor resi dulu sebelum menandai dikirim.");
      return;
    }
    run({ action: "ship", courier, tracking });
  };
  const approve = () =>
    start(async () => {
      const result = await reviewPayment(order.code, { approve: true, fundsConfirmed: funds });
      toast.result(result);
    });

  const stage = STAGE[order.stage];

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
        {shop ? (
          <>
            <Badge tone={STAGE_BADGE[stage.tone]} dot>
              {stage.label}
            </Badge>
            <Badge tone="indigo">{SHIPPING_LABEL[shop.method].short}</Badge>
          </>
        ) : (
          <>
            <PaymentBadge status={order.payment} />
            <span className={styles.muted}>{order.paymentMethod}</span>
            <OrderStatusBadge status={order.status} />
          </>
        )}
      </div>

      {shop && proof && (
        <>
          <section className={styles.section}>
            <div className={styles.sectionRow}>
              <h3 className={styles.sectionTitle}>Bukti transfer</h3>
              <a href={`/admin/orders/${order.code}/bukti/${proof.id}`} target="_blank" rel="noreferrer" className={styles.inlineLink}>
                <AdminIcon name="arrow-up-right" size={14} /> Perbesar
              </a>
            </div>
            <a href={`/admin/orders/${order.code}/bukti/${proof.id}`} target="_blank" rel="noreferrer" className={styles.proofPreview}>
              {proof.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- file privat lewat route ber-otorisasi
                <img src={`/admin/orders/${order.code}/bukti/${proof.id}`} alt={`Bukti transfer #${order.code}`} />
              ) : (
                <span className={styles.muted}>
                  <AdminIcon name="file-text" size={20} /> {proof.fileName} (PDF)
                </span>
              )}
            </a>
          </section>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Cocokkan pembayaran</h3>
            <dl className={styles.totals}>
              <div>
                <dt>Tagihan (+ kode unik {shop.uniqueCode})</dt>
                <dd>{formatRupiahPlain(shop.total)}</dd>
              </div>
              <div>
                <dt>Jumlah di bukti</dt>
                <dd className={styles.matchValue}>
                  {formatRupiahPlain(proof.amount)}
                  <Badge tone={proof.amount === shop.total ? "lime" : "pink"} dot>
                    {proof.amount === shop.total ? "Cocok" : "Tidak cocok"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Pengirim</dt>
                <dd>
                  {proof.senderName} · {proof.senderBank}
                </dd>
              </div>
              <div>
                <dt>Tanggal transfer</dt>
                <dd>{fmtDate(`${proof.transferDate}T12:00:00+07:00`)}</dd>
              </div>
              <div>
                <dt>Diunggah</dt>
                <dd>
                  {fmtTime(proof.uploadedAt)} · {ago(proof.uploadedAt)}
                </dd>
              </div>
              {proof.note && (
                <div>
                  <dt>Catatan</dt>
                  <dd>{proof.note}</dd>
                </div>
              )}
              {shop.rejections > 0 && (
                <div>
                  <dt>Ditolak sebelumnya</dt>
                  <dd>
                    {shop.rejections}× dari maks {MAX_REJECTIONS}
                  </dd>
                </div>
              )}
            </dl>
            <label className={styles.fundsCheck}>
              <input type="checkbox" checked={funds} onChange={(e) => setFunds(e.target.checked)} />
              <span>Dana {formatRupiahPlain(shop.total)} sudah masuk di mutasi rekening BCA</span>
            </label>
          </section>
        </>
      )}

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
            <dt>Ongkir · {shop ? SHIPPING_LABEL[shop.method].summary : order.courier}</dt>
            <dd>{formatRupiahPlain(order.shippingCost)}</dd>
          </div>
          {shop && (
            <div>
              <dt>Kode unik</dt>
              <dd>{formatRupiahPlain(shop.uniqueCode)}</dd>
            </div>
          )}
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
        <h3 className={styles.sectionTitle}>{method === "pickup" ? "Pickup" : "Pengiriman"}</h3>
        {shop && (
          <p className={styles.tracking}>
            <AdminIcon name="truck" size={16} />
            {method === "pickup" && shop.pickup
              ? `Mabar ${fmtDayDate(shop.pickup.startsAt)} · ${fmtTime(shop.pickup.startsAt)} · ${shop.pickup.venue}`
              : `${SHIPPING_LABEL[shop.method].title} · ${formatRupiahPlain(shop.shippingFee)}${shop.recipient.city ? ` · ${shop.recipient.city}` : ""}${shop.weightGrams ? ` · ${Math.max(1, Math.ceil(shop.weightGrams / 1000))} kg` : ""}${shop.distanceKm ? ` · ${String(shop.distanceKm).replace(".", ",")} km` : ""}`}
          </p>
        )}
        {method === "pickup" && shop?.pickup && order.payment !== "paid" && shop.pickup.late && (
          <p className={styles.notice}>Belum lunas saat H-1 sesi (21.00) — member diminta memilih sesi lain.</p>
        )}
        {method !== "pickup" && (
          <p className={styles.address}>
            {shop ? `${shop.recipient.name} · ${shop.recipient.phone} — ` : ""}
            {order.address}
          </p>
        )}
        {method === "instant" && shop?.pin && (
          <a className={styles.inlineLink} href={`https://www.google.com/maps/search/?api=1&query=${shop.pin.lat},${shop.pin.lng}`} target="_blank" rel="noreferrer">
            <AdminIcon name="map-pin" size={14} /> Buka titik di Google Maps
          </a>
        )}

        {proof ? (
          <>
            <div className={styles.verifyActions}>
              <AdminButton icon="x" className={styles.rejectButton} onClick={() => setRejectOpen(true)} disabled={saving}>
                Tolak
              </AdminButton>
              <AdminButton variant="primary" icon="check-bold" onClick={approve} disabled={saving || !funds}>
                {saving ? "Menyimpan…" : "Setujui pembayaran"}
              </AdminButton>
            </div>
            <p className={styles.muted} style={{ fontSize: 11 }}>
              Setelah disetujui: status → Perlu dikirim · pemasukan {formatRupiahPlain(order.grandTotal)} tercatat otomatis di Keuangan (Penjualan merchandise · Bank BCA) · +{Math.floor(order.subtotal / 10000)} Slay Point ke member.
            </p>
          </>
        ) : canShip && method === "pickup" ? (
          <>
            <AdminButton variant="primary" icon="check-circle" onClick={() => run({ action: "ready_pickup" })} disabled={saving}>
              Tandai siap diambil (dibawa host)
            </AdminButton>
            <button type="button" className={styles.textAction} disabled={saving} onClick={cancel}>
              Batalkan order
            </button>
          </>
        ) : canShip ? (
          <>
            <div className={styles.shipRow}>
              {method === "instant" ? (
                <label className={styles.shipSelect}>
                  <span className="visually-hidden">Kurir</span>
                  <select value={courier} onChange={(e) => setCourier(e.target.value)}>
                    {INSTANT_COURIERS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </label>
              ) : method === "jnt" ? (
                <span className={styles.tracking}>J&T Express Reguler</span>
              ) : (
                <label className={styles.shipSelect}>
                  <span className="visually-hidden">Kurir</span>
                  <select value={courier} onChange={(e) => setCourier(e.target.value)}>
                    {COURIERS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </label>
              )}
              <label className={styles.shipInput}>
                <span className="visually-hidden">{method === "instant" ? "Nama driver / no. booking" : "Nomor resi"}</span>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={method === "instant" ? "Driver / no. booking…" : "No. resi…"} />
              </label>
            </div>
            {method === "instant" && (
              <label className={styles.shipInput}>
                <span className="visually-hidden">Link lacak kurir</span>
                <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Link lacak kurir (https://…)" inputMode="url" />
              </label>
            )}
            <div className={styles.shipActions}>
              <AdminButton href={`/admin/orders/${order.code}/label`} target="_blank" icon="download-simple">
                Cetak label
              </AdminButton>
              <AdminButton variant="primary" icon="truck" onClick={markShipped} disabled={saving}>
                {saving ? "Menyimpan…" : "Tandai dikirim"}
              </AdminButton>
            </div>
            <button type="button" className={styles.textAction} disabled={saving} onClick={cancel}>
              Batalkan order
            </button>
          </>
        ) : order.status === "shipped" ? (
          <>
            {(order.trackingNumber || shop?.trackingUrl) && (
              <p className={styles.tracking}>
                <AdminIcon name="truck" size={16} />
                {order.courier} {order.trackingNumber && <span className={styles.code}>· {order.trackingNumber}</span>}
                {shop?.trackingUrl && (
                  <a href={shop.trackingUrl} target="_blank" rel="noreferrer" className={styles.inlineLink}>
                    lacak
                  </a>
                )}
              </p>
            )}
            <AdminButton icon="check-circle" onClick={() => run({ action: "complete" })} disabled={saving}>
              {method === "pickup" ? "Tandai sudah diambil" : "Tandai selesai (sudah diterima)"}
            </AdminButton>
          </>
        ) : (
          <>
            <p className={styles.muted}>
              {order.status === "cancelled"
                ? `Order dibatalkan${shop?.cancelReason ? ` — ${shop.cancelReason}` : ""}.`
                : order.status === "completed"
                  ? "Order selesai."
                  : shop?.payDeadline
                    ? `Menunggu ${order.stage === "reupload" ? "upload ulang bukti" : "pembayaran"} · batas ${fmtDayDate(shop.payDeadline)} ${fmtTime(shop.payDeadline)} (batal otomatis).`
                    : "Menunggu pembayaran."}
            </p>
            {order.status === "pending" && (
              <button type="button" className={styles.textAction} disabled={saving} onClick={cancel}>
                Batalkan order
              </button>
            )}
          </>
        )}
      </section>

      {rejectOpen && shop && <RejectDialog code={order.code} customer={order.customer} total={shop.total} rejections={shop.rejections} onClose={() => setRejectOpen(false)} />}
    </aside>
  );
}

/** Modal "Tolak bukti transfer?" (Figma Admin 06f): alasan + pesan untuk member. */
function RejectDialog({ code, customer, total, rejections, onClose }: { code: string; customer: string; total: number; rejections: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>(REJECT_REASONS[0]);
  const [message, setMessage] = useState("");
  const [saving, start] = useTransition();
  const last = rejections + 1 >= MAX_REJECTIONS;

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog?.addEventListener("cancel", onCancel);
    return () => dialog?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason === "Lainnya" && !message.trim()) return toast.error("Tulis pesan untuk member.");
    start(async () => {
      const result = await reviewPayment(code, { approve: false, reason, message });
      toast.result(result);
      if (result.ok) onClose();
    });
  };

  return (
    <dialog ref={ref} className={dialogStyles.dialog} aria-labelledby="reject-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className={dialogStyles.panel} onSubmit={submit} style={{ textAlign: "left", maxWidth: 520 }}>
        <h2 id="reject-title" className={dialogStyles.title}>
          Tolak bukti transfer?
        </h2>
        <p className={styles.muted}>
          #{code} · {customer} · {formatRupiahPlain(total)}
        </p>
        <fieldset className={styles.reasonList}>
          <legend className={styles.sectionTitle}>Alasan penolakan</legend>
          {REJECT_REASONS.map((r) => (
            <label key={r} className={styles.reason}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              <span>{r}</span>
            </label>
          ))}
        </fieldset>
        <label className={styles.reasonMessage}>
          <span className={styles.muted}>Pesan untuk member (tampil di halaman pembayaran){reason === "Lainnya" ? " *" : ""}</span>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="Contoh: Foto bukti terpotong, nominal & tanggal tidak terlihat. Mohon upload ulang screenshot yang lengkap ya." />
        </label>
        <p className={styles.notice}>
          {last
            ? `Ini penolakan ke-${MAX_REJECTIONS} — pesanan akan dibatalkan & stok dilepas. Hubungi member via WhatsApp.`
            : `Member diminta upload ulang dan batas bayar diperpanjang 24 jam dari sekarang. Penolakan ke-${rejections + 1} dari maks ${MAX_REJECTIONS} — setelah itu pesanan dibatalkan & member dihubungi via WhatsApp.`}
        </p>
        <div className={dialogStyles.actions}>
          <AdminButton type="button" onClick={onClose}>
            Batal
          </AdminButton>
          <AdminButton type="submit" variant="primary" icon="x" className={dialogStyles.danger} disabled={saving}>
            {saving ? "Menyimpan…" : last ? "Tolak & batalkan pesanan" : "Tolak & minta upload ulang"}
          </AdminButton>
        </div>
      </form>
    </dialog>
  );
}
