import Link from "next/link";
import styles from "./PlayerRating.module.css";

/** Undangan penilaian level (beta) untuk host: dashboard member & tab Hasil activity yang di-host. */
export function RatingInvite({ count, href, context }: { count: number; href: string; context: "dashboard" | "session" }) {
  if (count <= 0) return null;
  return (
    <Link href={href} className={styles.invite}>
      <span className={styles.inviteText}>
        <strong>{context === "session" ? `Nilai level ${count} pemain dari sesi ini` : "Kamu diundang menilai level pemain (beta)"}</strong>
        <span>
          {context === "session" ? "Anonim · bantu line-up berikutnya lebih seimbang" : `${count} pemain dari activity yang kamu host · ±${Math.max(1, Math.round(count * 0.25))} menit`}
        </span>
      </span>
      <span className={styles.inviteCta}>Mulai menilai</span>
    </Link>
  );
}
