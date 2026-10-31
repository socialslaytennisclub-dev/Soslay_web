import { Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { formatTanggalPendek } from "@/lib/format";
import type { CheckInItem } from "@/server/member/check-in";
import { SelfCheckIn } from "./SelfCheckIn";
import styles from "./CheckIn.module.css";

/** Daftar sesi hari ini di /akun/absensi, masing-masing dengan tombol "Saya hadir". */
export function CheckInList({ items, now }: { items: CheckInItem[]; now: number }) {
  if (!items.length) {
    return (
      <section className={styles.empty}>
        <h2>Belum ada sesi untuk check-in</h2>
        <p>Sesi yang kamu ikuti hari ini muncul di sini. Kalau kamu daftar lewat Kuyy tapi sesinya tidak muncul, pastikan email / nomor HP di Kuyy sama dengan akun Soslay — atau minta host meng-check-in kamu di lapangan.</p>
        <Link href="/akun/aktivitas" className={styles.link}>
          Lihat My Activities →
        </Link>
      </section>
    );
  }
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={cx(styles.card, item.checkedIn && styles.cardDone)}>
          <div className={styles.info}>
            <h2>{item.title}</h2>
            <span>
              <Clock size={14} aria-hidden /> {formatTanggalPendek(item.startsAt, item.city, "dateTime")}–{formatTanggalPendek(item.endsAt, item.city, "time")}
            </span>
            <span>
              <MapPin size={14} aria-hidden /> {item.venue}
            </span>
          </div>
          <div className={styles.action}>
            <SelfCheckIn sessionId={item.id} city={item.city} opensAt={item.opensAt} endsAt={item.endsAt} checkedIn={item.checkedIn} checkedInAt={item.checkedInAt} fetchedAt={now} variant="card" />
            <Link href={`/akun/aktivitas/${item.slug}`} className={styles.link}>
              Detail sesi →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
