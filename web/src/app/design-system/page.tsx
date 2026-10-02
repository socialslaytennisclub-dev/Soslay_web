import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import {
  Button,
  Container,
  Icon,
  type IconName,
  Logo,
  MediaCard,
  ProductCard,
  SocialPostCard,
  StatCard,
  Text,
} from "@/components/ui";
import { colorGroups, gradients, radii, spacing, typeScale } from "@/content/design-system";
import { activities, instagram, shop, stats, venues } from "@/content/home";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Design System — SOSLAY",
  robots: { index: false },
};

const icons: IconName[] = [
  "arrow-up-right-bold",
  "caret-down-bold",
  "shopping-bag-open",
  "map-pin",
  "users-three-bold",
  "tennis-ball-bold",
  "calendar-dots-bold",
  "aperture-bold",
  "instagram-logo",
  "threads-logo",
  "instagram-logo-fill",
  "threads-logo-fill",
  "whatsapp-logo-fill",
];

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.block}>
      <header className={styles.blockHeader}>
        <Text as="h2" variant="title-28" tone="primary">
          {title}
        </Text>
        {note && (
          <Text variant="body-14" tone="secondary">
            {note}
          </Text>
        )}
      </header>
      {children}
    </section>
  );
}

/** Styleguide hidup: semua token & komponen UI dirender dari kode yang sama dengan halaman produksi. */
export default function DesignSystemPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Container className={styles.heroInner}>
          <Logo tone="lime" />
          <Text as="h1" variant="heading-52" tone="accent">
            Design System
          </Text>
          <Text variant="body-16" tone="on-inverse" muted>
            Token & komponen Soslay — sumber: Figma “Soslay - Development”. Ubah nilai di <code>src/styles/tokens.css</code>,
            komponen di <code>src/components/ui</code>.
          </Text>
        </Container>
      </header>

      <Container className={styles.content}>
        <Block title="Warna" note="Lime = aksi · Navy = konteks gelap · Indigo = interaktif · Pink = status negatif">
          {colorGroups.map((group) => (
            <div key={group.name} className={styles.colorGroup}>
              <Text variant="body-16-bold" tone="primary">
                {group.name}
              </Text>
              <ul className={styles.swatches}>
                {group.tokens.map(({ token, hex }) => (
                  <li key={token} className={styles.swatch}>
                    <span className={styles.chip} style={{ background: `var(--color-${token})` }} />
                    <span className={styles.swatchToken}>--color-{token}</span>
                    <span className={styles.swatchHex}>{hex}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ul className={styles.gradients}>
            {gradients.map(({ token, note }) => (
              <li key={token} className={styles.swatch}>
                <span className={styles.gradientChip} style={{ background: `var(--${token})` }} />
                <span className={styles.swatchToken}>--{token}</span>
                <span className={styles.swatchHex}>{note}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Tipografi" note="Poppins (display) · Helvetica (body) · Inter (UI) · Chillax (wordmark)">
          <ul className={styles.typeList}>
            {typeScale.map(({ variant, figma, sample }) => (
              <li key={variant} className={styles.typeRow}>
                <div className={styles.typeMeta}>
                  <code>{variant}</code>
                  <span>{figma}</span>
                </div>
                <Text variant={variant} tone="primary" className={variant === "wordmark" ? styles.typeWordmark : undefined}>
                  {sample}
                </Text>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Spacing & Radius">
          <ul className={styles.spacing}>
            {spacing.map((value) => (
              <li key={value} className={styles.spacingRow}>
                <code>--space-{value}</code>
                <span className={styles.spacingBar} style={{ width: value }} />
              </li>
            ))}
          </ul>
          <ul className={styles.radii}>
            {radii.map(({ token, value }) => (
              <li key={token} className={styles.radius}>
                <span className={styles.radiusBox} style={{ borderRadius: `var(--${token})` } as CSSProperties} />
                <code>--{token}</code>
                <span className={styles.swatchHex}>{value}px</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Ikon" note="Phosphor, di-export dari Figma. Warna mengikuti currentColor.">
          <ul className={styles.icons}>
            {icons.map((name) => (
              <li key={name} className={styles.iconCell}>
                <Icon name={name} />
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Button" note="Satu CTA lime per viewport. Varian outline untuk aksi sekunder.">
          <div className={styles.row}>
            <Button href="#" variant="arrow">Booking Session di Kuyy</Button>
            <Button href="#" variant="arrow" size="sm">See all Court</Button>
            <Button href="#" variant="primary">Masuk</Button>
            <Button href="#" variant="primary" size="sm">Follow our Instagram</Button>
            <Button href="#" variant="outline" size="sm">Edit Profil</Button>
          </div>
          <div className={styles.darkRow}>
            <Button href="#" variant="outline-light" size="sm">Gabung Komunitas</Button>
            <Button href="#" variant="social" icon="instagram-logo-fill" aria-label="Instagram" />
            <Button href="#" variant="social" icon="threads-logo-fill" aria-label="Threads" />
            <Button href="#" variant="social" icon="whatsapp-logo-fill" aria-label="WhatsApp" />
          </div>
        </Block>

        <Block title="Kartu">
          <div className={styles.cards}>
            <MediaCard className={styles.mediaDemo} src={activities.items[1].image} objectPosition="50% 0%" overlay="25">
              <Text variant="title-28" tone="accent">
                MediaCard
              </Text>
            </MediaCard>
            <MediaCard className={styles.mediaDemo} src={venues.items[0].image} radius="md">
              <Text variant="title-24" tone="accent">
                {venues.items[0].name}
              </Text>
            </MediaCard>
            <div className={styles.cardCol}>
              <SocialPostCard {...instagram.posts[2]} />
            </div>
            <div className={styles.cardCol}>
              <ProductCard {...shop.products[0]} />
            </div>
          </div>
          <ul className={styles.statRow}>
            {stats.map((stat) => (
              <li key={stat.label}>
                <StatCard {...stat} />
              </li>
            ))}
          </ul>
        </Block>
      </Container>
    </main>
  );
}
