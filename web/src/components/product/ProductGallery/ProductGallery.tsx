"use client";

import Image from "next/image";
import { useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./ProductGallery.module.css";

type ProductGalleryProps = {
  images: { src: string; alt: string; position?: string }[];
};

/** Figma 25:1632 — thumbnail vertikal 91px + foto utama 599×749. Klik thumbnail → ganti foto. */
export function ProductGallery({ images }: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[active];
  const hasThumbs = images.length > 1;

  return (
    <div className={cx(styles.gallery, hasThumbs && styles.withThumbs)}>
      {hasThumbs && (
        <ul className={styles.thumbs} aria-label="Foto produk">
          {images.map((image, i) => (
            <li key={image.src}>
              <button
                type="button"
                className={cx(styles.thumb, i === active && styles.thumbActive)}
                onClick={() => setActive(i)}
                aria-label={`Lihat foto ${i + 1}: ${image.alt}`}
                aria-current={i === active}
              >
                <Image src={image.src} alt="" fill sizes="96px" style={{ objectPosition: image.position }} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.main} data-anim="reveal">
        <Image
          key={current.src}
          className={styles.mainImage}
          src={current.src}
          alt={current.alt}
          fill
          preload
          sizes="(min-width: 1200px) 599px, 100vw"
          style={{ objectPosition: current.position }}
        />
      </div>
    </div>
  );
}
