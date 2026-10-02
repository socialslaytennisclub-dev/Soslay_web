"use client";

import Image from "next/image";
import type { MouseEvent, RefObject } from "react";
import { AvatarStack, type AvatarStackItem } from "../AvatarStack/AvatarStack";
import { Icon } from "../Icon/Icon";
import styles from "./Lightbox.module.css";

export type LightboxItem = {
  src: string;
  alt: string;
  dateLabel: string;
  person: AvatarStackItem & { verified?: boolean };
  caption: string;
};

type LightboxProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  item: LightboxItem | null;
  position: { current: number; total: number } | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onBackdropClick: (event: MouseEvent<HTMLDialogElement>) => void;
};

/** Figma 25:1327 — overlay blur + kartu foto besar, tanggal, @handle (verified) & caption. */
export function Lightbox({ dialogRef, item, position, onClose, onNext, onPrev, onBackdropClick }: LightboxProps) {
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label="Foto galeri" onClick={onBackdropClick}>
      {item && (
        <div className={styles.frame}>
          <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={onPrev} aria-label="Foto sebelumnya">
            <Icon name="caret-down-bold" size={24} />
          </button>

          <article key={item.src} className={styles.card}>
            <Image className={styles.image} src={item.src} alt={item.alt} fill sizes="(min-width: 768px) 681px, 100vw" />
            <span className={styles.overlay} aria-hidden />

            <button type="button" className={styles.close} onClick={onClose} aria-label="Tutup">
              <Icon name="close" size={32} />
            </button>

            <div className={styles.info}>
              <p className={styles.date}>{item.dateLabel}</p>
              <p className={styles.person}>
                <AvatarStack items={[item.person]} />
                <span className={styles.handle}>{item.person.label}</span>
                {item.person.verified && <Icon name="seal-check-fill" label="Terverifikasi" className={styles.verified} />}
              </p>
              <p className={styles.caption}>{item.caption}</p>
            </div>
          </article>

          <button type="button" className={`${styles.nav} ${styles.next}`} onClick={onNext} aria-label="Foto berikutnya">
            <Icon name="caret-down-bold" size={24} />
          </button>

          {position && (
            <p className={styles.counter} aria-live="polite">
              {position.current} / {position.total}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
