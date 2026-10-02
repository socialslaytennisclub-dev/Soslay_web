import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import styles from "./Avatar.module.css";

type AvatarProps = {
  name: string;
  /** URL foto; tanpa foto → inisial lime di atas gradient indigo (Figma). */
  src?: string | null;
  size?: number;
  /** Border indigo-50 6px (avatar di header member, menimpa cover). */
  ring?: boolean;
  className?: string;
};

export function Avatar({ name, src, size = 88, ring, className }: AvatarProps) {
  const style = { "--avatar-size": `${size}px` } as CSSProperties;

  return (
    <span className={cx(styles.avatar, ring && styles.ring, className)} style={style} role="img" aria-label={name}>
      {src ? (
        // Foto bisa berupa blob: URL (preview upload) — next/image tidak mendukung itu.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={styles.photo} />
      ) : (
        <span className={styles.initials} aria-hidden>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
