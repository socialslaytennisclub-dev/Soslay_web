import Image from "next/image";
import { Button, Container, Text } from "@/components/ui";
import { hero } from "@/content/home";
import styles from "./Hero.module.css";

/** Animasi intro & parallax: src/animations/heroIntro.ts (dipicu oleh data-anim="hero"). */
export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title" data-anim="hero">
      <div className={styles.media} data-hero-media>
        <Image
          className={styles.image}
          src={hero.image.src}
          alt={hero.image.alt}
          fill
          preload
          sizes="100vw"
        />
      </div>
      <span className={styles.overlay} aria-hidden />

      <Container className={styles.content}>
        <Text as="h1" id="hero-title" variant="wordmark" align="center" className={styles.wordmark} data-hero-wordmark>
          {hero.title}
        </Text>

        <div className={styles.intro}>
          <Text variant="body-18" tone="white" className={styles.description} data-hero-lines>
            {hero.description.map((line) => (
              <span key={line} className={styles.line}>
                {line}
              </span>
            ))}
          </Text>
          <div data-hero-cta>
            <Button href={hero.cta.href} variant="outline-light" size="sm">
              {hero.cta.label}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
