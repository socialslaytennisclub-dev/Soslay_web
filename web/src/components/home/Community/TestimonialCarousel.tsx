"use client";

import Image from "next/image";
import { Icon, Text } from "@/components/ui";
import type { Testimonial } from "@/content/home";
import { useAutoRotate } from "@/hooks/useAutoRotate";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import { VIDEO_PLATFORM_LABEL, type VideoPlatform } from "@/lib/video";
import styles from "./TestimonialCarousel.module.css";
import { blurProps } from "@/lib/image";

type TestimonialCarouselProps = {
  items: Testimonial[];
};

/** Kartu testimoni lime (Figma 25:296) dengan rotasi otomatis + indikator titik. */
export function TestimonialCarousel({ items }: TestimonialCarouselProps) {
  const { index, goTo, pause, resume } = useAutoRotate(items.length);
  const active = items[index];

  return (
    <figure
      className={styles.card}
      aria-roledescription="carousel"
      aria-label="What Soslay members say"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className={styles.top}>
        <Icon name="threads-logo" />
      </div>

      <blockquote key={index} className={styles.quote} aria-live="polite">
        <Text variant="body-18" tone="primary" muted>
          {active.quote || `Watch ${active.name}'s Soslay story.`}
        </Text>
        {active.video && (
          <a href={active.video.url} target="_blank" rel="noopener noreferrer" className={styles.videoLink}>
            ▶ Watch on {VIDEO_PLATFORM_LABEL[active.video.platform as VideoPlatform]?.split(" ")[0] ?? "video"} ↗
          </a>
        )}
      </blockquote>

      <figcaption className={styles.bottom}>
        <span className={styles.author}>
          <span className={styles.avatar}>
            {active.avatar ? (
              <Image src={active.avatar} {...blurProps(active.avatar)} alt="" width={32} height={32} />
            ) : (
              <span className={styles.initials}>{initials(active.name)}</span>
            )}
          </span>
          <span className={styles.name}>{active.name}</span>
        </span>

        <span className={styles.dots}>
          {items.map((item, i) => (
            <button
              key={item.name}
              type="button"
              className={cx(styles.dot, i === index && styles.dotActive)}
              aria-label={`Testimonial ${i + 1} of ${items.length}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
