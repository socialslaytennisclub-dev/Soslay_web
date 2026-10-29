import Image from "next/image";
import { Avatar, Button, Chip, Container } from "@/components/ui";
import { member } from "@/content/member";
import styles from "./MemberHeader.module.css";
import { blurProps } from "@/lib/image";

type HeaderData = { name: string; username: string; email: string; tier: string; memberSince: string; memberId: string; photo?: string | null };

/**
 * Figma 25:2602 — cover foto, avatar menimpa cover, nama + meta, tier, aksi. Dipakai semua tab member.
 * `data` = profil member yang login (Supabase); tanpa itu memakai data contoh.
 */
export function MemberHeader({ data }: { data?: HeaderData | null }) {
  const m = data ?? member;
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.cover}>
          <Image src={member.cover} {...blurProps(member.cover)} alt="" fill preload sizes="(min-width: 1440px) 1312px, 100vw" className={styles.image} />
        </div>

        <div className={styles.profile}>
          <Avatar name={m.name} src={m.photo} size={128} ring className={styles.avatar} />

          <div className={styles.info} data-anim="fade-up">
            <h1 className={styles.name}>{m.name}</h1>
            <p className={styles.meta}>
              {/* ID Soslay = ID akun member, ditampilkan paling depan; lalu Kuy ID. */}
              <span className={styles.username}>ID {m.memberId}</span>
              {m.username && (
                <>
                  <span className={styles.dot} aria-hidden />
                  <span className={styles.username}>Kuy @{m.username}</span>
                </>
              )}
              <span className={styles.dot} aria-hidden />
              <span className={styles.email}>{m.email}</span>
            </p>
            <p className={styles.membership}>
              <Chip tone="lime" strong>
                {m.tier} Member
              </Chip>
              <span>Club member sejak {m.memberSince}</span>
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
