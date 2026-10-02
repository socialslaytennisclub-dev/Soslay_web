import { Button, Container, MediaCard, Text } from "@/components/ui";
import { community } from "@/content/home";
import { TestimonialCarousel } from "./TestimonialCarousel";
import styles from "./Community.module.css";

export function Community() {
  const { photos } = community;

  return (
    <section className={styles.section} aria-labelledby="community-title">
      <Container className={styles.grid}>
        <div className={styles.introColumn}>
          <div className={styles.intro}>
            <Text as="h2" id="community-title" variant="heading-42" tone="primary" data-anim="split">
              {community.title.map((line) => (
                <span key={line} className={styles.titleLine}>
                  {line}
                </span>
              ))}
            </Text>
            <Text variant="body-16" tone="primary" muted data-anim="fade-up">
              {community.description}
            </Text>
            <div data-anim="fade-up">
              <Button href={community.cta.href} variant="arrow" size="sm">
                {community.cta.label}
              </Button>
            </div>
          </div>
          <MediaCard
            className={styles.photoShort}
            data-anim="reveal"
            src={photos.group.src}
            alt={photos.group.alt}
            objectPosition={photos.group.position}
            overlay="none"
            sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw"
          />
        </div>

        <MediaCard
          className={styles.photoTall}
          data-anim="reveal"
          data-anim-delay="0.1"
          src={photos.court.src}
          alt={photos.court.alt}
          objectPosition={photos.court.position}
          overlay="none"
          sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw"
        />

        <div className={styles.stack}>
          <MediaCard
            className={styles.photoFlex}
            data-anim="reveal"
            data-anim-delay="0.2"
            src={photos.highfive.src}
            alt={photos.highfive.alt}
            objectPosition={photos.highfive.position}
            overlay="none"
            sizes="(min-width: 1200px) 424px, (min-width: 768px) 50vw, 100vw"
          />
          <div data-anim="fade-up">
            <TestimonialCarousel items={community.testimonials} />
          </div>
        </div>
      </Container>
    </section>
  );
}
