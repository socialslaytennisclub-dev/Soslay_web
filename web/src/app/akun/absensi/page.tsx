import type { Metadata } from "next";
import { CheckInList } from "@/components/member/CheckIn/CheckInList";
import { Container } from "@/components/ui";
import { getMyCheckIns } from "@/server/member/check-in";
import styles from "@/components/member/CheckIn/CheckIn.module.css";

export const metadata: Metadata = { title: "Check-in — SOSLAY" };

/**
 * Check-in mandiri (tombol "Check-in Attendance" di halaman Activity): peserta yang login menandai
 * hadir sendiri, 30 menit sebelum mulai s.d. sesi selesai. Tercatat sama seperti check-in host/admin.
 */
export default async function CheckInPage() {
  const { items, now } = await getMyCheckIns();
  return (
    <Container className={styles.page}>
      <header className={styles.head}>
        <span className={styles.eyebrow}>Check-in Attendance</span>
        <h1 className={styles.title}>Check-in sesi kamu</h1>
        <p className={styles.lead}>Sesi yang kamu ikuti hari ini & besok pagi. Tekan &quot;Saya hadir&quot; saat sudah sampai di lapangan — check-in dibuka 30 menit sebelum sesi mulai dan langsung tercatat untuk host &amp; admin.</p>
      </header>
      <CheckInList items={items} now={now} />
    </Container>
  );
}
