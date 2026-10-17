import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdminIcon, type AdminIconName } from "@/components/admin/ui/AdminIcon";
import { AdminLoginForm } from "@/components/auth/AdminLogin/AdminLoginForm";
import styles from "@/components/auth/AdminLogin/AdminLogin.module.css";

export const metadata: Metadata = {
  title: "Masuk Admin — SOSLAY",
  robots: { index: false, follow: false },
};

const MODULES: { icon: AdminIconName; title: string; text: string }[] = [
  { icon: "users-three", title: "Member & Slay Point", text: "CRM member, tier, poin, dan penukaran reward." },
  { icon: "calendar-dots", title: "Aktivitas & Booking", text: "Jadwal sesi, kuota, dan check-in kehadiran." },
  { icon: "storefront", title: "Shop & Order", text: "Katalog merch, stok varian, dan pengiriman." },
];

/** Login khusus tim Soslay — split screen gaya dashboard, beda dari halaman Masuk member. */
export default async function AdminLoginPage({ searchParams }: PageProps<"/masuk/admin">) {
  const next = (await searchParams).next;
  return (
    <main className={styles.page}>
      <section className={styles.brand} aria-label="Soslay Admin">
        <Link href="/" className={styles.logo} aria-label="Soslay — ke website">
          <Image src="/images/brand/logo-lime.webp" alt="" width={301} height={87} preload />
        </Link>
        <div className={styles.pitch}>
          <p className={styles.eyebrow}>Soslay Admin · CMS & CRM</p>
          <h1 className={styles.headline}>
            Kelola klub dari <span>satu dashboard.</span>
          </h1>
          <ul className={styles.modules}>
            {MODULES.map((m) => (
              <li key={m.title}>
                <span className={styles.moduleIcon}>
                  <AdminIcon name={m.icon} size={20} />
                </span>
                <span>
                  <strong>{m.title}</strong>
                  {m.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.brandFoot}>© Social Slay Tennis Club</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <span className={styles.badge}>
            <AdminIcon name="shield-check" size={16} />
            Area tim
          </span>
          <h2 className={styles.title}>Masuk ke Dashboard</h2>
          <p className={styles.lead}>Gunakan akun yang diundang Super Admin lewat Settings & Roles.</p>
          <AdminLoginForm next={Array.isArray(next) ? next[0] : next} />
          <p className={styles.switch}>
            Bukan tim Soslay? <Link href="/masuk">Masuk sebagai member</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
