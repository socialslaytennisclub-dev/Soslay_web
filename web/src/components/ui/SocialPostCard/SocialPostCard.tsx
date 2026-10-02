import { cx } from "@/lib/cx";
import { Icon } from "../Icon/Icon";
import { MediaCard } from "../MediaCard/MediaCard";
import styles from "./SocialPostCard.module.css";

export type SocialPostCardProps = {
  platform: "instagram" | "threads";
  text: string[];
  handle: string;
  /** Tanpa gambar → kartu navy (gaya post Threads). */
  image?: string;
  imagePosition?: string;
  href: string;
};

/** Figma: Card/Instagram — post IG (foto) atau Threads (navy, handle lime). */
export function SocialPostCard({ platform, text, handle, image, imagePosition, href }: SocialPostCardProps) {
  const label = platform === "instagram" ? "Instagram" : "Threads";

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
        src={image}
        objectPosition={imagePosition}
        radius="md"
        sizes="313px"
        corner={<Icon name={platform === "instagram" ? "instagram-logo" : "threads-logo"} />}
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
