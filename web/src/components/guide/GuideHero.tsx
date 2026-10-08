import Image from "next/image";
import Link from "next/link";
import { Button, Container, NavyBackdrop, ScrollLink } from "@/components/ui";
import { guideSections, type ParticipantGuide } from "@/content/guides";
import { blurProps } from "@/lib/image";
import { SectionLabel } from "./SectionLabel";
import styles from "./Guide.module.css";

type GuideHeroProps = { guide: ParticipantGuide; venueHref: string };

/** Figma 151:56 — breadcrumb, nama venue, judul, anchor 01–05, foto lebar + kartu info + booking. */
export function GuideHero({ guide, venueHref }: GuideHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="guide-title">
      <NavyBackdrop className={styles.heroBackdrop} height={720} />
      <Container className={styles.heroInner}>
        <div className={styles.heroHeading}>
          <nav
            aria-label="Breadcrumb"
            className={styles.breadcrumb}
            data-anim="fade-up"
          >
            <ol>
              <li>
                <Link href="/venue">Venue</Link>
              </li>
              <li>
                <Link href={venueHref}>{guide.venueName}</Link>
              </li>
              <li aria-current="page">Participant Guide</li>
            </ol>
          </nav>
          <SectionLabel tone="lime">{guide.venueName}</SectionLabel>
          <h1 id="guide-title" className={styles.heroTitle} data-anim="split">
            Participant Guide
          </h1>
          <p className={styles.heroIntro} data-anim="fade-up">
            {guide.intro}
          </p>
        </div>

        <nav
          aria-label="Isi panduan"
          className={styles.anchors}
          data-anim="stagger"
        >
          {guideSections.map((section, index) => (
            <ScrollLink
              key={section.id}
              href={`#${section.id}`}
              className={styles.anchor}
            >
              <span className={styles.anchorNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.label}
            </ScrollLink>
          ))}
        </nav>

        <div className={styles.heroMedia}>
          <div className={styles.heroPhoto} data-anim="reveal">
            <Image
              className={styles.cover}
              src={guide.hero.src}
              {...blurProps(guide.hero.src)}
              alt={guide.hero.alt}
              fill
              preload
              sizes="(min-width: 1440px) 1312px, 100vw"
              style={{ objectPosition: guide.hero.position }}
            />
          </div>

          <div className={styles.heroFooter}>
            <div className={styles.infoCard}>
              <p className={styles.infoName}>{guide.venueName}</p>
              <p className={styles.infoFacts}>{guide.facts.join("  ·  ")}</p>
              <p
                className={styles.handwritten}
                style={{ color: guide.theme.ink }}
              >
                {guide.note}
              </p>
            </div>
            <Button
              href={guide.cta.href}
              variant="arrow"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.heroCta}
            >
              {guide.cta.label}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
