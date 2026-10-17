import { Button, Container, SectionIntro, SocialPostCard, type SocialPostCardProps } from "@/components/ui";
import styles from "./InstagramFeed.module.css";

type InstagramFeedProps = {
  title: string;
  description: string;
  cta: { label: string; href: string };
  posts: SocialPostCardProps[];
};

/** Detik per kartu — kecepatan loop sama berapa pun jumlah post. */
const SECONDS_PER_POST = 7;

/**
 * Section "See You on the Court!" — dipakai di homepage, Activity, Shop & Product detail.
 * Feed berjalan terus (loop CSS) dan berhenti saat di-hover/fokus supaya post bisa dibaca & diklik.
 */
export function InstagramFeed({ title, description, cta, posts }: InstagramFeedProps) {
  return (
    <section className={styles.section} aria-labelledby="instagram-title">
      <Container>
        <SectionIntro id="instagram-title" align="center" title={title} description={description} />
      </Container>

      <div className={styles.viewport} data-anim="fade-up">
        {/* Dua salinan berurutan → saat bergeser sejauh satu salinan, loop terlihat mulus */}
        <ul className={styles.feed} aria-label="Latest Soslay posts" style={{ animationDuration: `${posts.length * SECONDS_PER_POST}s` }}>
          {[0, 1].map((copy) =>
            posts.map((post) => (
              <li key={`${copy}-${post.handle}`} className={styles.item} aria-hidden={copy === 1 || undefined} inert={copy === 1 || undefined}>
                <SocialPostCard {...post} />
              </li>
            )),
          )}
        </ul>
      </div>

      <Container className={styles.footer} data-anim="fade-up">
        <Button href={cta.href} variant="primary" size="sm" target="_blank" rel="noopener noreferrer">
          {cta.label}
        </Button>
      </Container>
    </section>
  );
}
