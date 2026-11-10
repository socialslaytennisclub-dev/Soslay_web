import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { KudosDetail } from "@/components/member/Kudos/KudosCard";
import { Container } from "@/components/ui";
import { getMyKudos } from "@/server/member/kudos";
import styles from "@/components/member/SessionDetail/Kudos.module.css";

export const metadata: Metadata = { title: "Kudos — SOSLAY" };

/** Detail kudos member (BR-23 · K-8): semua kategori per grup dengan angka. */
export default async function KudosPage() {
  const kudos = await getMyKudos();
  if (!kudos) notFound();
  return (
    <Container className={styles.page}>
      <Link href="/akun/profil" className={styles.link}>
        <ChevronLeft size={14} aria-hidden />
        Kembali ke profil
      </Link>
      <KudosDetail kudos={kudos} />
    </Container>
  );
}
