import Image from "next/image";
import Link from "next/link";
import { Button, Container, NavyBackdrop } from "@/components/ui";
import type { GuidePhoto } from "@/content/guides";
import { blurProps } from "@/lib/image";
import { SectionLabel } from "./SectionLabel";
import styles from "./Guide.module.css";

export type SpotlightHeroProps = {
  /** Item terakhir = halaman ini (tanpa href). */
  breadcrumb: { label: string; href?: string }[];
  eyebrow: string;
  title: string;
  intro: string;
  photo: GuidePhoto;
  /** Kartu info putih di pojok kiri bawah foto. */
  card: { name: string; facts: string[]; note?: string; ink?: string };
  cta?: { label: string; href: string };
};

/**
 * Figma Website v2 375:3659 / 375:4192 — hero Venue detail & Participant Guideline:
 * breadcrumb, eyebrow lime, nama venue, intro, foto lebar + kartu info (+ tombol).
 */
export function SpotlightHero({ breadcrumb, eyebrow, title, intro, photo, card, cta }: SpotlightHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="spotlight-title">
      <NavyBackdrop className={styles.heroBackdrop} height={720} />
      <Container className={styles.heroInner}>
        <div className={styles.heroHeading}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb} data-anim="fade-up">
            <ol>
              {breadcrumb.map((item) => (
                <li key={item.label} aria-current={item.href ? undefined : "page"}>
                  {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
                </li>
              ))}
            </ol>
          </nav>
          <SectionLabel tone="lime">{eyebrow}</SectionLabel>
          <h1 id="spotlight-title" className={styles.heroTitle} data-anim="split">
            {title}
          </h1>
          <p className={styles.heroIntro} data-anim="fade-up">
            {intro}
          </p>
        </div>

        <div className={styles.heroMedia}>
          <div className={styles.heroPhoto} data-anim="reveal">
            <Image
              className={styles.cover}
              src={photo.src}
              {...blurProps(photo.src)}
              alt={photo.alt}
              fill
              preload
              sizes="(min-width: 1440px) 1312px, 100vw"
              style={{ objectPosition: photo.position }}
            />
          </div>

          <div className={styles.heroFooter}>
            <div className={styles.infoCard}>
              <p className={styles.infoName}>{card.name}</p>
              <p className={styles.infoFacts}>{card.facts.join("  ·  ")}</p>
              {card.note && (
                <p className={styles.handwritten} style={{ color: card.ink }}>
                  {card.note}
                </p>
              )}
            </div>
            {cta && (
              <Button href={cta.href} variant="arrow" className={styles.heroCta}>
                {cta.label}
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
