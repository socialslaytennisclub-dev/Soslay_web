import Link from "next/link";
import { Button, Container, MediaCard, SectionIntro, StatCard, Text } from "@/components/ui";
import { activities, stats } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./Activities.module.css";

export function Activities() {
  return (
    <section className={styles.section} aria-labelledby="activities-title">
      <Container className={styles.inner}>
        <div className={styles.layout}>
          <SectionIntro
            id="activities-title"
            className={styles.intro}
            title={activities.title}
            description={activities.description}
          />

          <ul className={styles.grid}>
            {activities.items.map((item) => (
              <li key={item.title} className={cx(styles.item, styles[item.size])} data-anim="reveal">
                <Link href={item.href} className={styles.link} data-cursor="Lihat">
                  <MediaCard
                    className={styles.card}
                    src={item.image}
                    objectPosition={item.imagePosition}
                    overlay={item.overlay}
                    sizes="(min-width: 1200px) 535px, (min-width: 768px) 50vw, 100vw"
                  >
                    <div className={styles.cardText}>
                      <Text as="h3" variant="title-28" tone="accent">
                        {item.title}
                      </Text>
                      {item.description && (
                        <Text variant="body-16" tone="white" muted className={styles.cardDescription}>
                          {item.description}
                        </Text>
                      )}
                    </div>
                  </MediaCard>
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.cta} data-anim="fade-up">
            <Button href={activities.cta.href} variant="arrow" target="_blank" rel="noopener noreferrer">
              {activities.cta.label}
            </Button>
            <Text variant="body-14" tone="primary" muted>
              {activities.ctaCaption}
            </Text>
          </div>
        </div>

        <ul className={styles.stats} aria-label="Soslay dalam angka" data-anim="stagger">
          {stats.map((stat) => (
            <li key={stat.label}>
              <StatCard {...stat} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
