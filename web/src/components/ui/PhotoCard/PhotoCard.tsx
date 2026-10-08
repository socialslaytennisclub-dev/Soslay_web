import Image from "next/image";
import { AvatarStack, type AvatarStackItem } from "../AvatarStack/AvatarStack";
import styles from "./PhotoCard.module.css";
import { blurProps } from "@/lib/image";

export type PhotoCardProps = {
  src: string;
  alt: string;
  position?: string;
  dateLabel: string;
  people: AvatarStackItem[];
  /** Klik → buka lightbox. */
  onOpen?: () => void;
};

/** Figma: gallery/card — foto potret 424×530 radius 16 + avatar member ter-tag & tanggal. */
export function PhotoCard({ src, alt, position, dateLabel, people, onOpen }: PhotoCardProps) {
  return (
    <figure className={styles.card}>
      <button type="button" className={styles.photo} onClick={onOpen} data-cursor="Lihat" aria-label={`Lihat foto: ${alt}`}>
        <Image
          className={styles.image}
          src={src} {...blurProps(src)}
          alt={alt}
          fill
          sizes="(min-width: 1200px) 424px, (min-width: 768px) 33vw, 50vw"
          style={{ objectPosition: position }}
        />
      </button>
      <figcaption className={styles.footer}>
        <AvatarStack items={people} />
        <span className={styles.date}>{dateLabel}</span>
      </figcaption>
    </figure>
  );
}
