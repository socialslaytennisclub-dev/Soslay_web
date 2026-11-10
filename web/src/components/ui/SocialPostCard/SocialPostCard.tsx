import { IMAGE_ASPECT } from "@/lib/image-aspect";
import { POST_PLATFORMS, type PostPlatform } from "@/lib/community-posts";
import { cx } from "@/lib/cx";
import { Icon } from "../Icon/Icon";
import { MediaCard } from "../MediaCard/MediaCard";
import styles from "./SocialPostCard.module.css";

export type SocialPostCardProps = {
  platform: PostPlatform;
  text: string[];
  handle: string;
  /** Tanpa gambar → kartu navy (kutipan saja). */
  image?: string;
  imagePosition?: string;
  href: string;
};

const ICON = { instagram: "instagram-logo", tiktok: "tiktok-logo", threads: "threads-logo" } as const;

/** Figma: Card/Instagram — post IG / TikTok (foto) atau kutipan saja (navy, handle lime). */
export function SocialPostCard({ platform, text, handle, image, imagePosition, href }: SocialPostCardProps) {
  const label = POST_PLATFORMS[platform].label;
  const icon = ICON[platform];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      aria-label={`${label} ${handle}: ${text.join(" ")}`}
      draggable={false}
      data-cursor="Buka"
    >
      <MediaCard
        className={styles.card}
        style={{ aspectRatio: IMAGE_ASPECT.communityPost }}
        src={image}
        objectPosition={imagePosition}
        radius="md"
        sizes="313px"
        corner={<Icon name={icon} />}
      >
        <div className={cx(styles.body, !image && styles.centered)}>
          {text.map((paragraph) => (
            <p key={paragraph} className={styles.text}>
              {paragraph}
            </p>
          ))}
        </div>
        <p className={cx(styles.handle, !image && styles.handleAccent)}>{handle}</p>
      </MediaCard>
    </a>
  );
}
