import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./Button.module.css";

/**
 * Varian dari komponen Figma:
 * - arrow         → Button/Arrow  (CTA utama lime + bulatan navy berisi panah)
 * - primary       → Button/Pill   (pill lime)
 * - indigo        → Button/Pill indigo, teks lime neon (mis. "Masuk" di banner login)
 * - outline       → Button/Outline (border navy)
 * - secondary     → Button/Absensi (border abu, teks navy — aksi sekunder di latar terang)
 * - outline-light → Button/Pill outline putih di atas foto (hero)
 * - social        → Button/Social (lingkaran putih berisi ikon)
 */
export type ButtonVariant = "arrow" | "primary" | "indigo" | "outline" | "secondary" | "outline-light" | "social";
export type ButtonSize = "sm" | "md";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Wajib untuk varian `social` (ikon di dalam lingkaran). */
  icon?: IconName;
  className?: string;
  children?: ReactNode;
};

type LinkButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children"> & { href: string };

type NativeButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children"> & { href?: undefined; as?: undefined };

/** Tampilan tombol tanpa interaksi sendiri — dipakai di dalam kartu yang sudah berupa link. */
type DecorativeButtonProps = CommonProps & { as: "span"; href?: undefined };

export type ButtonProps = LinkButtonProps | NativeButtonProps | DecorativeButtonProps;

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", icon, className, children, ...rest } = props;
  const classes = cx(styles.button, styles[variant], styles[size], className);
  // Efek magnetic GSAP (src/animations/magnetic.ts) untuk tombol CTA.
  const magnetic = variant === "outline" || variant === "secondary" || variant === "outline-light" ? undefined : variant === "social" ? "0.4" : "0.25";

  const content =
    variant === "social" ? (
      <Icon name={icon ?? "instagram-logo-fill"} size={32} />
    ) : (
      <>
        <span className={styles.label}>{children}</span>
        {variant === "arrow" && (
          <span className={styles.arrowBadge} aria-hidden>
            <Icon name="arrow-up-right-bold" size={size === "sm" ? 20 : 24} />
          </span>
        )}
      </>
    );

  if ("as" in rest && rest.as === "span") {
    return (
      <span className={classes} aria-hidden>
        {content}
      </span>
    );
  }

  if (rest.href !== undefined) {
    const linkProps = rest as Omit<LinkButtonProps, keyof CommonProps>;
    return (
      <Link className={classes} data-magnetic={magnetic} {...linkProps}>
        {content}
      </Link>
    );
  }

  const buttonProps = rest as Omit<NativeButtonProps, keyof CommonProps>;
  return (
    <button type="button" className={classes} data-magnetic={magnetic} {...buttonProps}>
      {content}
    </button>
  );
}
