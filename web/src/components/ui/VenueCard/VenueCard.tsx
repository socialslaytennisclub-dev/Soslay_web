import Link from "next/link";
import { MediaCard } from "../MediaCard/MediaCard";
import { Text } from "../Text/Text";
import styles from "./VenueCard.module.css";

export type VenueCardProps = {
  name: string;
  city: string;
  type: string;
  image: string;
  imagePosition?: string;
  href: string;
};

/** Figma: Card/Venue — foto 633×371, nama lime + "Kota · Tipe". Dipakai di homepage & halaman Venue. */
export function VenueCard({ name, city, type, image, imagePosition, href }: VenueCardProps) {
  return (
    <Link href={href} className={styles.link} data-cursor="Lihat">
      <MediaCard
        className={styles.card}
        src={image}
        alt={`Lapangan ${name}`}
        objectPosition={imagePosition}
        radius="md"
        sizes="(min-width: 1200px) 633px, (min-width: 768px) 50vw, 100vw"
      >
        <div className={styles.text}>
          <h3 className={styles.name}>{name}</h3>
          <Text variant="body-18-ui" tone="on-inverse" muted>
            {city} · {type}
          </Text>
        </div>
      </MediaCard>
    </Link>
  );
}
