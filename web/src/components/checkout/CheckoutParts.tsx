import { Check, ChevronRight, MessageCircle, Truck, X, Zap, Volleyball, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { checkoutSteps } from "@/content/checkout";
import { whatsappUrl } from "@/content/social";
import { fmtDayDate, fmtTime, rp, SHIPPING_LABEL, STAGE, type OrderStage, type ShippingMethod, type StageTone } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import type { MyOrder } from "@/server/shop/types";
import styles from "./Checkout.module.css";

/** Bagian bersama halaman Checkout / Pembayaran / status pesanan (tanpa state → bisa dipakai server & klien). */

export const METHOD_ICON: Record<ShippingMethod, LucideIcon> = { jnt: Truck, instant: Zap, pickup: Volleyball };

type ShellProps = {
  breadcrumb: { label: string; href?: string }[];
  back: { label: string; href: string };
  title: string;
  subtitle?: string;
  /** Langkah aktif 1–4; langkah sebelumnya dianggap selesai. 5 = semua selesai. */
  step: number;
  children: ReactNode;
};

/** Header halaman (breadcrumb + H1 + stepper di desktop; back link + progress 4 segmen di HP) + isi. */
export function CheckoutShell({ breadcrumb, back, title, subtitle, step, children }: ShellProps) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={back.href} className={styles.back}>
          ‹ {back.label}
        </Link>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          {breadcrumb.map((b, i) => (
            <span key={b.label}>
              {i > 0 && <>&nbsp; / &nbsp;</>}
              {b.href ? <Link href={b.href}>{b.label}</Link> : b.label}
            </span>
          ))}
        </nav>
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <ol className={styles.stepper} aria-label="Langkah pesanan">
            {checkoutSteps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "active" : "todo";
              return (
                <li key={label} style={{ display: "contents" }}>
                  {i > 0 && <span className={cx(styles.connector, n <= step && styles.connectorDone)} aria-hidden />}
                  <span className={cx(styles.step, state === "done" && styles.stepDone, state === "active" && styles.stepActive)} aria-current={state === "active" ? "step" : undefined}>
                    <span className={styles.stepDot}>{state === "done" ? <Check size={14} strokeWidth={3} /> : n}</span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className={styles.progress}>
          <div className={styles.segments} aria-hidden>
            {checkoutSteps.map((label, i) => (
              <span key={label} className={cx(styles.segment, i + 1 < step && styles.segmentDone, i + 1 === step && styles.segmentActive)} />
            ))}
          </div>
          <p className={styles.progressCaption}>
            Langkah {Math.min(step, 4)} dari 4 · {checkoutSteps[Math.min(step, 4) - 1]}
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}

export function Chip({ tone = "indigo", plain, children }: { tone?: StageTone; plain?: boolean; children: ReactNode }) {
  return <span className={cx(styles.chip, styles[`chip_${tone}`], plain && styles.chipPlain)}>{children}</span>;
}

export const StageChip = ({ stage }: { stage: OrderStage }) => <Chip tone={STAGE[stage].tone}>{STAGE[stage].label}</Chip>;

export function Card({ title, aside, className, children }: { title?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx(styles.card, className)}>
      {(title || aside) && (
        <div className={styles.cardHead}>
          {title && <h2 className={styles.cardTitle}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className={styles.kv}>
      {rows.map(([k, v], i) => (
        <div key={i} className={styles.kvRow}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductLine({ name, variant, image, price, quantity, weight }: { name: string; variant: string; image: string; price: number; quantity: number; weight?: string }) {
  return (
    <div className={styles.item}>
      <span className={styles.thumb}>{image && <Image src={image} alt="" fill sizes="72px" />}</span>
      <span className={styles.itemText}>
        <span className={styles.itemName}>{name}</span>
        <span className={styles.itemMeta}>
          {[variant, `×${quantity}`].filter(Boolean).join(" · ")}
        </span>
        {weight && <span className={styles.itemWeight}>{weight}</span>}
      </span>
      <span className={styles.itemPrice}>{rp(price * quantity)}</span>
    </div>
  );
}

/** "Ongkir · J&T Reguler" / "Ongkir · Instant (8,4 km)" / "Ongkir · Pickup Mabar". */
export function shippingLine(method: ShippingMethod, km?: number | null) {
  return `Ongkir · ${SHIPPING_LABEL[method].summary}${method === "instant" && km ? ` (${String(km).replace(".", ",")} km)` : ""}`;
}

/** Total dengan 3 digit kode unik disorot lime: "Rp238." + "137". */
export function TotalWithCode({ total, className }: { total: number; className?: string }) {
  const text = rp(total);
  return (
    <span className={className}>
      {text.slice(0, -3)}
      <span className={styles.uniqueDigits}>{text.slice(-3)}</span>
    </span>
  );
}

/** Kartu ringkasan pesanan di kolom kanan halaman pembayaran / status. */
export function OrderSummaryCard({ order, chips }: { order: MyOrder; chips: ReactNode }) {
  const Icon = METHOD_ICON[order.method];
  return (
    <Card
      title={`#${order.code}`}
      aside={
        <span className={styles.muted}>
          {fmtDayDate(order.placedAt).replace(/^\w+, /, "")}
        </span>
      }
    >
      <div className={styles.actionsRow}>{chips}</div>
      <hr className={styles.divider} />
      <div className={styles.items}>
        {order.items.map((i) => (
          <ProductLine key={`${i.name}-${i.variant}`} {...i} />
        ))}
      </div>
      <hr className={styles.divider} />
      <KV
        rows={[
          ["Subtotal", rp(order.subtotal)],
          [shippingLine(order.method, order.distanceKm), order.shippingFee ? rp(order.shippingFee) : <span className={styles.free}>Gratis</span>],
          ["Kode unik", rp(order.uniqueCode)],
        ]}
      />
      <div className={styles.summaryTotal}>
        <span>Total transfer</span>
        <strong>{rp(order.total)}</strong>
      </div>
      <hr className={styles.divider} />
      <div className={styles.person}>
        <Icon size={20} />
        <span className={styles.personText}>
          <span className={styles.strong}>{SHIPPING_LABEL[order.method].title}</span>
          <span className={styles.muted}>
            {order.method === "pickup" && order.pickup
              ? `${fmtDayDate(order.pickup.startsAt)} · ${fmtTime(order.pickup.startsAt)}–${fmtTime(order.pickup.endsAt)} · ${order.pickup.venue}`
              : [order.recipient.address, order.recipient.city, order.recipient.postalCode].filter(Boolean).join(", ")}
          </span>
        </span>
      </div>
    </Card>
  );
}

export function HelpLink({ code }: { code: string }) {
  return (
    <a href={whatsappUrl(`Halo admin Soslay, saya ada kendala transfer untuk pesanan #${code}.`)} target="_blank" rel="noreferrer" className={styles.helpLink}>
      <MessageCircle size={18} />
      <span>Ada kendala transfer? Chat admin via WhatsApp</span>
      <ChevronRight size={16} />
    </a>
  );
}

export type TimelineEntry = { title: string; detail?: ReactNode; state: "done" | "current" | "todo" | "rejected" };

export function Timeline({ items }: { items: TimelineEntry[] }) {
  return (
    <ol className={styles.timeline}>
      {items.map((t, i) => (
        <li key={i} className={cx(styles.tlItem, t.state === "done" && styles.tlDone, t.state === "current" && styles.tlCurrent, t.state === "todo" && styles.tlTodo, t.state === "rejected" && styles.tlRejected)}>
          <span className={styles.tlDot} aria-hidden>
            {t.state === "done" && <Check size={14} strokeWidth={3} />}
            {t.state === "rejected" && <X size={14} strokeWidth={3} />}
          </span>
          <span className={styles.itemText}>
            <span className={styles.tlTitle}>{t.title}</span>
            {t.detail && <span className={styles.muted}>{t.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
