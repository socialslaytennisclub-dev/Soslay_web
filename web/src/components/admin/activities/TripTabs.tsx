import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./Trip.module.css";

/** Tab halaman trip (Figma 05x-2): Info & activities · Rundown · Peserta & pembayaran. */
export function TripTabs({ tripId, active }: { tripId: string; active: "info" | "peserta" }) {
  const base = `/admin/activities/trip/${tripId}`;
  const tabs = [
    { href: base, label: "Info & activities", on: active === "info" },
    { href: `${base}#rundown`, label: "Rundown", on: false },
    { href: `${base}/peserta`, label: "Peserta & pembayaran", on: active === "peserta" },
  ];
  return (
    <nav className={styles.pageTabs} aria-label="Halaman trip">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} className={cx(styles.pageTab, t.on && styles.pageTabOn)} aria-current={t.on ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
