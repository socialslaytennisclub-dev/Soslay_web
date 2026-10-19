import Image from "next/image";
import { Chip, Container, Icon, Text } from "@/components/ui";
import type { ActivityAbout as ActivityAboutContent } from "@/content/activity";
import { blurProps } from "@/lib/image";
import styles from "./ActivityAbout.module.css";

type ActivityAboutProps = ActivityAboutContent & { id: string };

/**
 * "What is Mabar / Match Day / Escape?" tepat di bawah hero halaman tipe aktivitas.
 * Layout editorial: foto di kiri, teks + daftar poin bernomor di kanan — judul tidak sejajar
 * dengan judul section jadwal di bawahnya, jadi tidak terasa berulang.
 */
export function ActivityAbout({ id, heading, title, image, paragraphs, points }: ActivityAboutProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <Container className={styles.layout}>
        <div className={styles.photo} data-anim="reveal">
          <Image
            className={styles.image}
            src={image.src}
            {...blurProps(image.src)}
            alt={image.alt}
            fill
            sizes="540px" // hanya tampil di desktop (lihat .photo)
            style={{ objectPosition: image.position }}
          />
        </div>

        <div className={styles.content}>
          <p data-anim="fade-up">
            <Chip tone="navy" strong className={styles.label}>
              <Icon name="tennis-ball-bold" size={16} />
              {heading}
            </Chip>
          </p>
          <Text as="h2" id={id} variant="heading-42" tone="primary" className={styles.title} data-anim="split">
            {title}
          </Text>
          <div className={styles.body} data-anim="fade-up">
            {paragraphs.map((paragraph) => (
              <Text key={paragraph} variant="body-16" tone="primary" muted>
                {paragraph}
              </Text>
            ))}
          </div>

          <ol className={styles.points} data-anim="stagger">
            {points.map((point, index) => (
              <li key={point.title} className={styles.point}>
                <span className={styles.number} aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.pointText}>
                  <Text as="h3" variant="subtitle-20" tone="primary">
                    {point.title}
                  </Text>
                  <Text variant="body-16" tone="primary" muted>
                    {point.text}
                  </Text>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
