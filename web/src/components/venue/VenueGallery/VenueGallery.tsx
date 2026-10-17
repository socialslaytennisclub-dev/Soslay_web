"use client";

import { Container, Lightbox, PhotoCard, Text, type LightboxItem } from "@/components/ui";
import type { GalleryPhoto } from "@/content/gallery";
import { venuePage } from "@/content/venues";
import { useLightbox } from "@/hooks/useLightbox";
import { SplitHeading } from "../SplitHeading/SplitHeading";
import styles from "./VenueGallery.module.css";

type VenueGalleryProps = {
  venueName: string;
  photos: GalleryPhoto[];
  /** Label tanggal per foto (sudah diformat di server sesuai zona waktu venue). */
  dateLabels: Record<string, string>;
};

/** Figma Website v2 375:3909 — "Moments from past sessions": grid 3 kolom foto potret + lightbox. */
export function VenueGallery({ venueName, photos, dateLabels }: VenueGalleryProps) {
  const lightbox = useLightbox(photos.length);
  const active = lightbox.index !== null ? photos[lightbox.index] : null;

  const item: LightboxItem | null = active && {
    src: active.src,
    alt: active.alt,
    dateLabel: dateLabels[active.id],
    caption: active.caption,
    person: {
      label: active.members[active.members.length - 1].handle,
      initial: active.members[active.members.length - 1].initial,
      tone: active.members[active.members.length - 1].tone,
      verified: active.members[active.members.length - 1].verified,
    },
  };

  return (
    <section className={styles.section} aria-labelledby="venue-gallery-title">
      <Container className={styles.inner}>
        <SplitHeading id="venue-gallery-title" title={venuePage.detail.gallery.title} description={venuePage.detail.gallery.description(venueName)} />

        {photos.length === 0 ? (
          <Text variant="body-16" tone="primary" muted className={styles.empty}>
            {venuePage.detail.gallery.empty}
          </Text>
        ) : (
          <ul className={styles.grid}>
            {photos.map((photo, i) => (
              <li key={photo.id} data-anim="reveal" data-anim-delay={String((i % 3) * 0.1)}>
                <PhotoCard
                  src={photo.src}
                  alt={photo.alt}
                  position={photo.position}
                  dateLabel={dateLabels[photo.id]}
                  people={photo.members.map((m) => ({ label: m.handle, initial: m.initial, tone: m.tone }))}
                  onOpen={() => lightbox.open(i)}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Lightbox
        dialogRef={lightbox.dialogRef}
        item={item}
        position={lightbox.index !== null ? { current: lightbox.index + 1, total: photos.length } : null}
        onClose={lightbox.close}
        onNext={lightbox.next}
        onPrev={lightbox.prev}
        onBackdropClick={lightbox.onBackdropClick}
      />
    </section>
  );
}
