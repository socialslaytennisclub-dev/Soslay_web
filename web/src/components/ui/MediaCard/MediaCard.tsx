import Image from "next/image";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./MediaCard.module.css";
import { blurProps } from "@/lib/image";

export type MediaOverlay = "none" | "25" | "45" | "50";

type MediaCardProps = Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  as?: ElementType;
  /** Tanpa `src` → kartu solid navy (mis. kartu kutipan Threads). */
  src?: string;
  alt?: string;
  /** Titik fokus foto, mis. "50% 30%". Mengikuti crop di Figma. */
  objectPosition?: string;
  /** Kekuatan scrim gradien bawah (token overlay/photo-*). */
  overlay?: MediaOverlay;
  radius?: "md" | "lg";
  sizes?: string;
  preload?: boolean;
  /** Konten pojok atas (mis. ikon IG di kanan, chip status di kiri). */
  corner?: ReactNode;
  cornerAlign?: "start" | "end";
  /** Konten yang menempel di bawah kartu. */
  children?: ReactNode;
  className?: string;
};

/** Kartu foto dengan scrim + konten di atasnya — dipakai Activity, Venue, Community & Instagram card. */
export function MediaCard({
  as: Component = "div",
  src,
  alt = "",
  objectPosition = "50% 50%",
  overlay = "50",
  radius = "lg",
  sizes = "(min-width: 1200px) 40vw, 100vw",
  preload,
  corner,
  cornerAlign = "end",
  children,
  className,
  ...rest
}: MediaCardProps) {
  return (
    <Component {...rest} className={cx(styles.card, styles[`radius-${radius}`], !src && styles.solid, className)}>
      {src && (
        <Image
          className={styles.image}
          src={src} {...blurProps(src)}
          alt={alt}
          fill
          sizes={sizes}
          preload={preload}
          style={{ objectPosition }}
        />
      )}
      {src && overlay !== "none" && <span className={cx(styles.overlay, styles[`overlay-${overlay}`])} />}
      {(corner || children) && (
        <div className={styles.content}>
          {corner && <div className={cx(styles.corner, cornerAlign === "start" && styles.cornerStart)}>{corner}</div>}
          {children && <div className={styles.body}>{children}</div>}
        </div>
      )}
    </Component>
  );
}
