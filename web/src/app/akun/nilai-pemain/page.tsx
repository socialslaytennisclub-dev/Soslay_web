import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlayerRating } from "@/components/member/PlayerRating/PlayerRating";
import styles from "@/components/member/PlayerRating/PlayerRating.module.css";
import { Container } from "@/components/ui";
import { getMyRatingQueue } from "@/server/member/player-rating";

export const metadata: Metadata = { title: "Penilaian Level Pemain — SOSLAY" };

/**
 * Penilaian level pemain oleh host (beta). `?sesi=<id>&judul=…` → hanya peserta activity itu (dari tab
 * Hasil setelah Akhiri Activity); tanpa → semua pemain 90 hari terakhir.
 */
export default async function PlayerRatingPage({ searchParams }: PageProps<"/akun/nilai-pemain">) {
  const { sesi, judul, kembali } = await searchParams;
  const sessionId = typeof sesi === "string" && /^[0-9a-f-]{36}$/.test(sesi) ? sesi : undefined;
  const items = await getMyRatingQueue(sessionId);
  if (!items) redirect("/masuk?next=/akun/nilai-pemain");
  // Kembali hanya ke halaman sendiri (path relatif), bukan URL luar.
  const back = typeof kembali === "string" && kembali.startsWith("/") && !kembali.startsWith("//") ? kembali : "/akun";
  return (
    <Container className={styles.page}>
      <PlayerRating items={items} sessionTitle={sessionId && typeof judul === "string" ? judul.slice(0, 80) : null} backHref={back} />
    </Container>
  );
}
