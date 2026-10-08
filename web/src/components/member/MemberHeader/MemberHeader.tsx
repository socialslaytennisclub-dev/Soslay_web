import Image from "next/image";
import { Avatar, Button, Chip, Container } from "@/components/ui";
import { member } from "@/content/member";
import styles from "./MemberHeader.module.css";
import { blurProps } from "@/lib/image";

/** Figma 25:2602 — cover foto, avatar menimpa cover, nama + meta, tier, aksi. Dipakai semua tab member. */
export function MemberHeader() {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.cover}>
          <Image src={member.cover} {...blurProps(member.cover)} alt="" fill preload sizes="(min-width: 1440px) 1312px, 100vw" className={styles.image} />
        </div>

        <div className={styles.profile}>
          <Avatar name={member.name} size={128} ring className={styles.avatar} />

          <div className={styles.info} data-anim="fade-up">
            <h1 className={styles.name}>{member.name}</h1>
            <p className={styles.meta}>
              <span className={styles.username}>@{member.username}</span>
              <span className={styles.dot} aria-hidden />
              <span className={styles.email}>{member.email}</span>
            </p>
            <p className={styles.membership}>
              <Chip tone="lime" strong>
                {member.tier} Member
              </Chip>
              <span>Club member sejak {member.memberSince}</span>
            </p>
          </div>

          <div className={styles.actions} data-anim="fade-up">
            <Button href="/akun/profil" variant="outline" scroll={false}>
              Edit Profil
            </Button>
            <Button href={member.bookingUrl} variant="arrow" target="_blank" rel="noopener noreferrer">
              Booking Session di Kuyy
            </Button>
          </div>
        </div>
      </Container>
    </header>
  );
}
