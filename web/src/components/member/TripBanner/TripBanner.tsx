import Image from "next/image";
import Link from "next/link";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { PAY_STATUS_LABEL, PLAN_LABEL, tripDays, tripRange } from "@/lib/trips";
import type { MemberTrip } from "@/server/member/trips";
import styles from "./TripBanner.module.css";

/** Banner "Special event · Tennis trip" di My Activities (Figma DT-1 / MT-1). */
export function TripBanner({ trip }: { trip: MemberTrip }) {
  const p = trip.package;
  return (
    <article className={styles.banner}>
      <div className={styles.media}>
        <Image src={trip.image} alt="" fill sizes="(min-width: 768px) 320px, 100vw" />
        <span className={styles.eyebrow}>★ Special event · Tennis trip</span>
      </div>
      <div className={styles.body}>
        <h2 className={styles.title}>{trip.title}</h2>
        <p className={styles.meta}>
          {tripRange(trip.startsOn, trip.endsOn)} · {trip.activities.length} activity{trip.area ? ` · ${trip.area.replace(/^[^·]*·\s*/, "")}` : ""} · {tripDays(trip.startsOn, trip.endsOn)} hari
        </p>
        <p className={styles.chips}>
          {p ? (
            <>
              <span className={styles.chip}>Paket bundling · {PLAN_LABEL[p.plan]}</span>
              <span className={p.status === "paid" ? styles.chipPaid : styles.chipDue}>
                {p.status === "paid" ? "Lunas" : `${PAY_STATUS_LABEL[p.status]} · sisa ${formatRupiahPlain(p.remaining)} · lunasi s.d. ${p.due}`}
              </span>
            </>
          ) : (
            <span className={styles.chip}>Tiket satuan · {trip.activities.length} activity</span>
          )}
        </p>
        {trip.next && <p className={styles.next}>Berikutnya: {trip.next}</p>}
        <Link href={`/akun/trip/${trip.slug}`} className={styles.cta}>
          {p ? "Lihat rundown & rangkaian acara" : "Lihat info trip"}
        </Link>
      </div>
    </article>
  );
}
