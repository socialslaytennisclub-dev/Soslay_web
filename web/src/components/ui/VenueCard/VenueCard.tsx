import { IMAGE_ASPECT } from "@/lib/image-aspect";
import { cityInEnglish } from "@/lib/venue-options";
import Link from "next/link";
import { MediaCard } from "../MediaCard/MediaCard";
import { Text } from "../Text/Text";
import styles from "./VenueCard.module.css";

export type VenueCardProps = {
  name: string;
  /** Wilayah website ("Jakarta" / "Tangerang" / "Yogyakarta" / "Bali") atau kota master — dipakai bila cityName kosong. */
  city: string;
  /** Kota dari master venue ("Jakarta Pusat") — ditampilkan dalam bahasa Inggris, sama dengan card detail venue. */
  cityName?: string;
  type: string;
  image: string;
  imagePosition?: string;
  href: string;
};

/** Figma: Card/Venue — foto 633×371, nama lime + "Kota · Tipe". Dipakai di homepage & halaman Venue. */
export function VenueCard({ name, city, cityName, type, image, imagePosition, href }: VenueCardProps) {
  const location = cityInEnglish(cityName ?? city);
  return (
    <Link href={href} className={styles.link} data-cursor="Lihat">
      <MediaCard
        style={{ aspectRatio: IMAGE_ASPECT.venueCover }}
        src={image}
        alt={`${name} court`}
        objectPosition={imagePosition}
        radius="md"
        sizes="(min-width: 1200px) 633px, (min-width: 768px) 50vw, 100vw"
      >
        <div className={styles.text}>
          <h3 className={styles.name}>{name}</h3>
          <Text variant="body-18-ui" tone="on-inverse" muted>
            {[location, type].filter(Boolean).join(" · ")}
          </Text>
        </div>
      </MediaCard>
    </Link>
  );
}
