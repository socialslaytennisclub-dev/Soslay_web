import type { CSSProperties } from "react";
import styles from "./Icon.module.css";

/** Ikon Phosphor yang di-export dari Figma (public/icons). Warna mengikuti `currentColor`. */
export type IconName =
  | "aperture-bold"
  | "arrow-up-right-bold"
  | "calendar-blank"
  | "calendar-check-bold"
  | "calendar-dots-bold"
  | "caret-down-bold"
  | "check-bold"
  | "clock"
  | "close"
  | "info"
  | "instagram-logo"
  | "instagram-logo-fill"
  | "map-pin"
  | "minus-bold"
  | "package"
  | "plus-bold"
  | "ruler"
  | "seal-check-fill"
  | "shield-check"
  | "shopping-bag-open"
  | "tennis-ball-bold"
  | "trash"
  | "threads-logo"
  | "threads-logo-fill"
  | "truck"
  | "users-three-bold"
  | "whatsapp-logo-fill";

type IconProps = {
  name: IconName;
  size?: number;
  /** Isi untuk ikon yang punya makna sendiri (bukan dekoratif). */
  label?: string;
  className?: string;
};

export function Icon({ name, size = 24, label, className }: IconProps) {
  const style = {
    "--icon-src": `url(/icons/${name}.svg)`,
    "--icon-size": `${size}px`,
  } as CSSProperties;

  return (
    <span
      className={[styles.icon, className].filter(Boolean).join(" ")}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
