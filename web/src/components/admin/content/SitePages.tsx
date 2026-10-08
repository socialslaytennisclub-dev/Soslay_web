import Link from "next/link";
import type { SitePage } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./Content.module.css";

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** Tab Halaman lain: daftar halaman website yang copy/fotonya bisa diubah. */
export function SitePages({ pages }: { pages: SitePage[] }) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Halaman lain</h2>
          <p className={styles.muted}>Hero, copy, dan foto per halaman · editor per halaman dibangun setelah Supabase tersambung</p>
        </div>
      </header>
      <ul className={styles.pages}>
        {pages.map((p) => (
          <li key={p.path} className={styles.page}>
            <span className={styles.sectionIcon}>
              <AdminIcon name="layout" size={18} />
            </span>
            <span className={styles.postText}>
              <span className={styles.sectionName}>{p.name}</span>
              <span className={styles.sectionSummary}>{p.description}</span>
            </span>
            <span className={styles.pageMeta}>
              <span className={styles.muted}>
                Diubah {p.updatedBy} · {day.format(new Date(p.updatedAt))}
              </span>
              <Link href={p.path} target="_blank" className={styles.iconButton} aria-label={`Buka ${p.name}`}>
                <AdminIcon name="arrow-up-right" size={16} />
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
