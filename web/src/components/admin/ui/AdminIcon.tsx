import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import styles from "./AdminUI.module.css";

/** Ikon Phosphor admin (public/icons/admin, lihat scripts/sync-admin-icons.mjs). Warna = currentColor. */
export type AdminIconName =
  | "squares-four" | "users-three" | "user" | "calendar-dots" | "map-pin" | "t-shirt" | "receipt" | "layout"
  | "images" | "gear-six" | "magnifying-glass" | "bell-simple" | "funnel-simple" | "download-simple"
  | "caret-down" | "caret-right" | "caret-left" | "pencil-simple" | "eye" | "upload-simple" | "dots-six-vertical"
  | "trend-up" | "trend-down" | "clock" | "whatsapp-logo" | "instagram-logo" | "envelope-simple" | "phone"
  | "image" | "tag" | "sign-out" | "star" | "x" | "coins" | "shopping-bag-open" | "tennis-ball" | "qr-code"
  | "copy" | "trash" | "arrows-down-up" | "crown-simple" | "package" | "truck" | "link-simple" | "globe-simple"
  | "question" | "arrow-up-right" | "check-circle" | "warning-circle" | "note-pencil" | "user-plus"
  | "calendar-plus" | "sliders-horizontal" | "text-t" | "list-bullets" | "map-trifold" | "storefront"
  | "chat-circle-text" | "shield-check" | "key" | "plus-bold" | "check-bold" | "dots-three-bold"
  | "dots-three-vertical-bold";

type AdminIconProps = { name: AdminIconName; size?: number; label?: string; className?: string };

export function AdminIcon({ name, size = 20, label, className }: AdminIconProps) {
  return (
    <span
      className={cx(styles.icon, className)}
      style={{ "--icon-src": `url(/icons/admin/${name}.svg)`, "--icon-size": `${size}px` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
