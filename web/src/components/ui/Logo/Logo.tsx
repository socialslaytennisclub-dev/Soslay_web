import Image from "next/image";
import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./Logo.module.css";

type LogoProps = {
  /** lime untuk latar gelap/foto, navy untuk latar lime/terang. */
  tone?: "lime" | "navy";
  size?: "md" | "lg";
  className?: string;
};

/** Logo "SLAY CLUB." + ikon pemain. Aset raster dari Figma. */
export function Logo({ tone = "lime", size = "md", className }: LogoProps) {
  return (
    <Link href="/" className={cx(styles.logo, styles[size], className)} aria-label="Soslay — beranda">
      <Image src={`/images/brand/logo-${tone}.webp`} alt="" width={301} height={87} preload={size === "md"} />
    </Link>
  );
}
