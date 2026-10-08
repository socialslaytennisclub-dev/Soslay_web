"use client";

import Image from "next/image";
import { Icon, Text } from "@/components/ui";
import type { Testimonial } from "@/content/home";
import { useAutoRotate } from "@/hooks/useAutoRotate";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
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
      aria-label="Kata member Soslay"
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
          {active.quote}
        </Text>
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
              aria-label={`Testimoni ${i + 1} dari ${items.length}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
