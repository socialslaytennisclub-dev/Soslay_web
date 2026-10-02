import Image from "next/image";
import { Button, Container, NavyBackdrop, ScrollLink } from "@/components/ui";
import styles from "./PageHero.module.css";

export type PageHeroContent = {
  /** Kata raksasa Chillax lime di atas (gaya wordmark "SOSLAY" di homepage), mis. "Shop". */
  wordmark: string;
  /** Label lime di atas judul (gaya "Aktivitas mendatang"). */
  eyebrow: string;
  title: string;
  /** Bagian judul yang diberi warna lime (harus ada di dalam `title`). */
  highlight?: string;
  description: string;
  cta: { label: string; href: `#${string}` };
  /** Chip fakta singkat di atas foto. */
  meta: string[];
  image: { src: string; alt: string; position?: string };
};

type PageHeroProps = PageHeroContent & { id: string };

/**
 * Hero halaman dalam (Shop 25:1346 · Venue 25:751) — satu bahasa dengan Home & Activity:
 * latar navy + swoosh indigo, wordmark Chillax lime raksasa, judul putih Poppins ExtraBold,
 * deskripsi + CTA arrow, lalu foto lebar yang setengahnya keluar dari area navy.
 */
export function PageHero({ id, wordmark, eyebrow, title, highlight, description, cta, meta, image }: PageHeroProps) {
  const [before, after] = highlight && title.includes(highlight) ? title.split(highlight) : [title, undefined];

  return (
    <section className={styles.hero} aria-labelledby={id} data-anim="hero">
      <NavyBackdrop className={styles.backdrop} />

      <Container className={styles.inner}>
        <p className={styles.wordmark} aria-hidden data-hero-wordmark>
          {wordmark}
        </p>

        <div className={styles.intro}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id={id} className={styles.title} data-hero-lines>
              {before}
              {after !== undefined && (
                <>
                  <span className={styles.highlight}>{highlight}</span>
                  {after}
                </>
              )}
            </h1>
          </div>

          <div className={styles.aside} data-hero-cta>
            <p className={styles.description}>{description}</p>
            <ScrollLink href={cta.href} className={styles.cta} aria-label={cta.label}>
              <Button as="span" variant="arrow">
                {cta.label}
              </Button>
            </ScrollLink>
          </div>
        </div>

        <div className={styles.photo} data-anim="reveal">
          <Image
            className={styles.image}
            src={image.src}
            alt={image.alt}
            fill
            preload
            sizes="(min-width: 1440px) 1312px, 100vw"
            style={{ objectPosition: image.position }}
          />
          <ul className={styles.meta}>
            {meta.map((item) => (
              <li key={item} className={styles.metaItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
