import Image from "next/image";
import type { CSSProperties } from "react";
import { Button, Container, Icon } from "@/components/ui";
import type { GuidePhoto, ParticipantGuide } from "@/content/guides";
import { cx } from "@/lib/cx";
import { blurProps } from "@/lib/image";
import { SectionLabel } from "./SectionLabel";
import styles from "./Guide.module.css";

type SectionProps = { guide: ParticipantGuide };

function Photo({ photo, sizes, className }: { photo: GuidePhoto; sizes: string; className?: string }) {
  return (
    <div className={cx(styles.photo, className)} data-anim="reveal">
      <Image
        className={styles.cover}
        src={photo.src}
        {...blurProps(photo.src)}
        alt={photo.alt}
        fill
        sizes={sizes}
        style={{ objectPosition: photo.position }}
      />
    </div>
  );
}

/** 01 — Outfit (Figma 151:91): palet warna, warna yang dihindari, 4 contoh look. */
export function OutfitSection({ guide }: SectionProps) {
  const { outfit } = guide;
  return (
    <section id="outfit" className={styles.section} aria-labelledby="outfit-title">
      <Container className={styles.outfit}>
        <div className={styles.outfitText}>
          <SectionLabel>01 — Outfit Recommendation</SectionLabel>
          <h2 id="outfit-title" className={styles.sectionTitle} data-anim="split">
            {outfit.title}
          </h2>
          <p className={styles.body} data-anim="fade-up">
            {outfit.body}
          </p>
          <ul className={styles.palette} aria-label="Warna yang disarankan" data-anim="stagger">
            {outfit.palette.map((color) => (
              <li key={color.name} className={styles.swatchItem}>
                <span className={styles.swatch} style={{ background: color.hex }} aria-hidden />
                <span className={styles.swatchName}>{color.name}</span>
                <span className={styles.swatchRole}>{color.role}</span>
              </li>
            ))}
          </ul>
          <div className={styles.avoid} data-anim="fade-up">
            <p className={styles.avoidLabel}>Hindari</p>
            <ul className={styles.avoidList}>
              {outfit.avoid.map((color) => (
                <li key={color.name}>
                  <span className={styles.avoidDot} style={{ background: color.hex }} aria-hidden />
                  {color.name}
                </li>
              ))}
            </ul>
          </div>
          <p className={styles.footnote}>{outfit.avoidNote}</p>
        </div>

        <ul className={styles.looks}>
          {outfit.looks.map((look) => (
            <li key={look.title} className={styles.look}>
              <Photo photo={look.photo} className={styles.lookPhoto} sizes="(min-width: 1200px) 170px, (min-width: 768px) 25vw, 50vw" />
              <p className={styles.lookTitle}>{look.title}</p>
              <p className={styles.lookCaption}>{look.caption}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** 02 — Barang bawaan (Figma 151:146): grid checklist, item opsional bertanda "+". */
export function BringSection({ guide }: SectionProps) {
  const { bring } = guide;
  return (
    <section id="barang-bawaan" className={cx(styles.section, styles.sectionTight)} aria-labelledby="bring-title">
      <Container className={styles.stack}>
        <header className={styles.splitHeading}>
          <div className={styles.headingGroup}>
            <SectionLabel>02 — What to Bring</SectionLabel>
            <h2 id="bring-title" className={styles.sectionTitle} data-anim="split">
              {bring.title}
            </h2>
          </div>
          <p className={styles.body} data-anim="fade-up">
            {bring.body}
          </p>
        </header>
        <ul className={styles.bringGrid} data-anim="stagger">
          {bring.items.map((item) => (
            <li key={item.name} className={styles.bringItem}>
              <span className={cx(styles.bringIcon, item.optional && styles.bringIconOptional)} aria-hidden>
                <Icon name={item.optional ? "plus-bold" : "check-bold"} size={item.optional ? 16 : 20} />
              </span>
              <span className={styles.bringText}>
                <span className={styles.bringName}>
                  {item.name}
                  {item.optional && <span className={styles.optional}>opsional</span>}
                </span>
                <span className={styles.bringNote}>{item.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** 03 — Photo reference (Figma 151:224): latar navy, masonry 3 kolom berlabel. */
export function PhotoReferenceSection({ guide }: SectionProps) {
  const { photoReference } = guide;
  return (
    <section id="photo-reference" className={styles.photoRef} aria-labelledby="photo-ref-title">
      <Container className={styles.stackWide}>
        <header className={styles.splitHeading}>
          <div className={styles.headingGroup}>
            <SectionLabel tone="lime">03 — Photo Reference</SectionLabel>
            <h2 id="photo-ref-title" className={cx(styles.sectionTitle, styles.titleLime)} data-anim="split">
              {photoReference.title.map((line) => (
                <span key={line} className={styles.line}>
                  {line}
                </span>
              ))}
            </h2>
          </div>
          <p className={cx(styles.body, styles.bodyInverse)} data-anim="fade-up">
            {photoReference.body}
          </p>
        </header>
        <div className={styles.masonry}>
          {photoReference.columns.map((column, columnIndex) => (
            <div key={columnIndex} className={styles.masonryColumn}>
              {column.map((item, itemIndex) => {
                // Pola Figma: kolom 1 & 3 = tinggi lalu pendek, kolom 2 = pendek lalu tinggi.
                const tall = columnIndex === 1 ? itemIndex === 1 : itemIndex === 0;
                return (
                  <figure key={item.label} className={cx(styles.refCard, tall ? styles.refTall : styles.refShort)}>
                    <Photo photo={item.photo} className={styles.refPhoto} sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw" />
                    <figcaption className={styles.refLabel}>{item.label}</figcaption>
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** 04 — Court vibe (Figma 151:251): panel terakota, palet venue, foto suasana. */
export function CourtVibeSection({ guide }: SectionProps) {
  const { courtVibe, theme } = guide;
  return (
    <section id="court-vibe" className={styles.courtSection} aria-labelledby="court-title">
      <Container>
        <div className={styles.courtPanel} style={{ "--panel": theme.panel } as CSSProperties}>
          <div className={styles.courtTop}>
            <div className={styles.courtText}>
              <SectionLabel>04 — The Court Vibe</SectionLabel>
              <h2 id="court-title" className={cx(styles.sectionTitle, styles.titleWhite)} data-anim="split">
                {courtVibe.title}
              </h2>
              <p className={cx(styles.body, styles.bodyOnPanel)} data-anim="fade-up">
                {courtVibe.body}
              </p>
              <ul className={styles.courtPalette} aria-label="Palet warna venue">
                {courtVibe.palette.map((color) => (
                  <li key={color.name} style={{ background: color.hex }} className={color.dark ? styles.onDark : undefined}>
                    {color.name}
                  </li>
                ))}
              </ul>
              <p className={cx(styles.handwritten, styles.handwrittenLarge)}>{courtVibe.note}</p>
            </div>
            <div className={styles.courtPhotos}>
              <Photo photo={courtVibe.feature} className={styles.courtFeature} sizes="(min-width: 1200px) 380px, 100vw" />
              <div className={styles.courtSide}>
                {courtVibe.side.map((photo) => (
                  <Photo key={photo.src} photo={photo} className={styles.courtSmall} sizes="(min-width: 1200px) 380px, 50vw" />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.courtStrip}>
            {courtVibe.strip.map((photo) => (
              <Photo key={photo.src} photo={photo} className={styles.courtSmall} sizes="(min-width: 1200px) 400px, (min-width: 768px) 33vw, 100vw" />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/** 05 — Quick tips + CTA booking (Figma 151:280). */
export function QuickTipsSection({ guide }: SectionProps) {
  const { tips, cta } = guide;
  return (
    <section id="quick-tips" className={cx(styles.section, styles.sectionLast)} aria-labelledby="tips-title">
      <Container className={styles.stack}>
        <div className={styles.headingGroup}>
          <SectionLabel>05 — Quick Tips</SectionLabel>
          <h2 id="tips-title" className={styles.sectionTitle} data-anim="split">
            {tips.title}
          </h2>
        </div>
        <ol className={styles.tips} data-anim="stagger">
          {tips.items.map((tip, index) => (
            <li key={tip.title} className={styles.tip}>
              <span className={styles.tipNumber} aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className={styles.tipTitle}>{tip.title}</p>
              <p className={styles.tipBody}>{tip.body}</p>
            </li>
          ))}
        </ol>
        <div className={styles.cta} data-anim="fade-up">
          <div className={styles.ctaText}>
            <p className={styles.ctaTitle}>{cta.title}</p>
            <p className={styles.ctaBody}>{cta.body}</p>
          </div>
          <Button href={cta.href} variant="arrow" target="_blank" rel="noopener noreferrer">
            {cta.label}
          </Button>
        </div>
      </Container>
    </section>
  );
}
