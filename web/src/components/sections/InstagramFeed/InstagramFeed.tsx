"use client";

import { Button, Container, SectionIntro, SocialPostCard, type SocialPostCardProps } from "@/components/ui";
import { useDragScroll } from "@/hooks/useDragScroll";
import styles from "./InstagramFeed.module.css";

type InstagramFeedProps = {
  title: string;
  description: string;
  cta: { label: string; href: string };
  posts: SocialPostCardProps[];
};

/**
 * Section "See You on the Court!" — dipakai di homepage, Activity, Shop & Product detail.
 * Feed bisa di-scroll/drag horizontal dan "bleed" sampai tepi kanan layar seperti di Figma.
 */
export function InstagramFeed({ title, description, cta, posts }: InstagramFeedProps) {
  const scrollerRef = useDragScroll<HTMLUListElement>();

  return (
    <section className={styles.section} aria-labelledby="instagram-title">
      <Container>
        <SectionIntro id="instagram-title" align="center" title={title} description={description} />
      </Container>

      <ul ref={scrollerRef} className={styles.feed} aria-label="Post terbaru Soslay" data-anim="stagger" data-anim-from="right">
        {posts.map((post) => (
          <li key={post.handle} className={styles.item}>
            <SocialPostCard {...post} />
          </li>
        ))}
      </ul>

      <Container className={styles.footer} data-anim="fade-up">
        <Button href={cta.href} variant="primary" size="sm" target="_blank" rel="noopener noreferrer">
          {cta.label}
        </Button>
      </Container>
    </section>
  );
}
