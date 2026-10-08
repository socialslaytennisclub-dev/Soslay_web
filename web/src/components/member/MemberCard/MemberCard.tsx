import Image from "next/image";
import { Icon } from "@/components/ui";
import { member } from "@/content/member";
import styles from "./MemberCard.module.css";

/**
 * Figma 25:2638 — Official Member Card: navy, garis lapangan putih 20%, blob indigo,
 * emblem bunga lime + bola + segel tier holografik, Member ID & masa berlaku.
 */
export function MemberCard() {
  return (
    <article className={styles.card} aria-label={`Kartu member ${member.tier} ${member.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ornamen SVG statis */}
      <img src="/images/member/star.svg" alt="" className={styles.blob} />
      <svg className={styles.court} viewBox="0 0 392 248" preserveAspectRatio="none" aria-hidden>
        <rect x="0.75" y="0.75" width="390.5" height="246.5" />
        <line x1="0" y1="22" x2="392" y2="22" />
        <line x1="0" y1="226" x2="392" y2="226" />
        <line x1="90" y1="22" x2="90" y2="226" />
        <line x1="302" y1="22" x2="302" y2="226" />
        <line x1="90" y1="124" x2="302" y2="124" />
        <line x1="196" y1="0" x2="196" y2="248" />
      </svg>

      <header className={styles.header}>
        <Image src="/images/brand/logo-lime.webp" alt="Slay Club" width={80} height={23} />
        <p className={styles.overline}>Official Member Card</p>
      </header>

      <div className={styles.emblem} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- ornamen SVG statis */}
        <img src="/images/member/flower.svg" alt="" className={styles.flower} />
        <span className={styles.ball}>
          <Icon name="tennis-ball-bold" size={22} />
        </span>
        <span className={styles.seal}>{member.tier}</span>
      </div>

      <footer className={styles.footer}>
        <p className={styles.memberId}>
          <span className={styles.idLabel}>Member ID</span>
          <span className={styles.idValue}>{member.memberId}</span>
        </p>
        <p className={styles.meta}>
          <span>{member.name}</span>
          <span>Valid thru {member.validThru}</span>
        </p>
      </footer>
    </article>
  );
}
