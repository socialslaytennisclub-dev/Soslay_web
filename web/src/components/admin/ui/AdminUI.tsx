import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { BOOKING_STATUS_LABEL, ORDER_STATUS_LABEL, PAYMENT_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import type { BookingStatus, OrderStatus, PaymentStatus, Tier } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import styles from "./AdminUI.module.css";

/** Primitif UI admin (Figma "Soslay Admin — CMS & CRM", 25:3056). */

// ── Kartu ───────────────────────────────────────────────────────────────────
type CardProps = {
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Card({ title, subtitle, action, className, children }: CardProps) {
  return (
    <section className={cx(styles.card, className)}>
      {(title || action) && (
        <header className={styles.cardHeader}>
          <div>
            {title && <h2 className={styles.cardTitle}>{title}</h2>}
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Link kecil indigo dengan caret, mis. "Kelola member ›". */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.cardLink}>
      {children}
      <AdminIcon name="caret-right" size={14} />
    </Link>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
export type BadgeTone = "lime" | "indigo" | "neutral" | "pink" | "navy" | "blue";

export function Badge({ tone = "neutral", dot, icon, children }: { tone?: BadgeTone; dot?: boolean; icon?: AdminIconName; children: ReactNode }) {
  return (
    <span className={cx(styles.badge, styles[`badge-${tone}`])}>
      {dot && <span className={styles.badgeDot} aria-hidden />}
      {icon && <AdminIcon name={icon} size={12} />}
      {children}
    </span>
  );
}

const TIER_TONE: Record<Tier, BadgeTone> = { basic: "neutral", silver: "blue", gold: "lime", platinum: "navy" };

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <Badge tone={TIER_TONE[tier]} icon="crown-simple">
      {TIER_LABEL[tier]}
    </Badge>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = { paid: "lime", pending: "indigo", failed: "pink", refunded: "neutral" };
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONE[status]} dot>
      {PAYMENT_LABEL[status]}
    </Badge>
  );
}

const ORDER_TONE: Record<OrderStatus, BadgeTone> = { pending: "neutral", processing: "indigo", shipped: "neutral", completed: "lime", cancelled: "pink" };
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_TONE[status]} dot>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

const BOOKING_TONE: Record<BookingStatus, BadgeTone> = { registered: "indigo", waitlisted: "neutral", cancelled: "neutral", attended: "lime", no_show: "pink" };
export function BookingBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge tone={BOOKING_TONE[status]} dot>
      {BOOKING_STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Avatar inisial (warna pastel dari nama) ─────────────────────────────────
const AVATAR_TONES = ["indigo", "lime", "pink"] as const;

export function MemberAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={cx(styles.avatar, styles[`avatar-${tone}`])} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>
      {initials(name)}
    </span>
  );
}

// ── Tombol admin ────────────────────────────────────────────────────────────
type AdminButtonProps = {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  icon?: AdminIconName;
  iconAfter?: AdminIconName;
  children: ReactNode;
  className?: string;
} & ({ href: string } & Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children">
  | { href?: undefined } & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">);

export function AdminButton({ variant = "outline", size = "md", icon, iconAfter, children, className, ...rest }: AdminButtonProps) {
  const classes = cx(styles.button, styles[`button-${variant}`], styles[`button-${size}`], className);
  const content = (
    <>
      {icon && <AdminIcon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconAfter && <AdminIcon name={iconAfter} size={16} />}
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...(rest as ComponentPropsWithoutRef<"button">)}>
      {content}
    </button>
  );
}

/** Kotak tanggal "27 / SEP" (Sesi mendatang). */
export function DateBox({ iso }: { iso: string }) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(date).replace(".", "").toUpperCase();
  return (
    <span className={styles.dateBox}>
      <span className={styles.dateDay}>{day}</span>
      <span className={styles.dateMonth}>{month}</span>
    </span>
  );
}

/** Persentase naik/turun di KPI ("↗ +7,2%"). */
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={cx(styles.delta, up ? styles.deltaUp : styles.deltaDown)}>
      <AdminIcon name={up ? "trend-up" : "trend-down"} size={14} />
      {up ? "+" : "−"}
      {Math.abs(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}

// ── Tabel → kartu di HP ─────────────────────────────────────────────────────
/** Kelas untuk membungkus <table>: tampil mulai 768px, disembunyikan di HP. */
export const desktopOnlyClass = styles.desktopOnly;

export function MobileCardList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul className={styles.mobileCards} aria-label={label}>
      {children}
    </ul>
  );
}

type MobileCardProps = {
  href?: string;
  /** Kiri atas: identitas (avatar/nama, kode order, judul sesi). */
  title: ReactNode;
  /** Kanan atas: badge status/tier. */
  aside?: ReactNode;
  /** Pasangan label kecil + nilai di bawah garis putus-putus. */
  meta?: { label: string; value: ReactNode }[];
  /** Elemen di depan judul, mis. checkbox pilih. */
  leading?: ReactNode;
  selected?: boolean;
};

/** Satu baris tabel dalam bentuk kartu (pola "Member terbaru"). */
export function MobileCard({ href, title, aside, meta, leading, selected }: MobileCardProps) {
  const body = (
    <>
      <span className={styles.mobileCardTop}>
        <span className={styles.mobileCardTitle}>{title}</span>
        {aside}
      </span>
      {meta && meta.length > 0 && (
        <span className={styles.mobileCardMeta} style={{ gridTemplateColumns: `repeat(${Math.min(meta.length, 3)}, minmax(0, 1fr))` }}>
          {meta.map((m) => (
            <span key={m.label}>
              <span className={styles.mobileMetaLabel}>{m.label}</span>
              {m.value}
            </span>
          ))}
        </span>
      )}
    </>
  );
  return (
    <li className={cx(styles.mobileCard, selected && styles.mobileCardSelected)}>
      {leading && <span className={styles.mobileCardLeading}>{leading}</span>}
      {href ? (
        <Link href={href} className={styles.mobileCardBody}>
          {body}
        </Link>
      ) : (
        <span className={styles.mobileCardBody}>{body}</span>
      )}
    </li>
  );
}
