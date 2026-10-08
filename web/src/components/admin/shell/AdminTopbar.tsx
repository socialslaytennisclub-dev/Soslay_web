import { AdminIcon } from "../ui/AdminIcon";
import styles from "./AdminShell.module.css";

type AdminTopbarProps = {
  /** "Umum / Overview" */
  breadcrumb: string;
  title: string;
};

/** Figma 25:3254 — breadcrumb + judul, pencarian global (⌘K), notifikasi. */
export function AdminTopbar({ breadcrumb, title }: AdminTopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.titles}>
        <p className={styles.breadcrumb}>{breadcrumb}</p>
        <h1 className={styles.pageTitle}>{title}</h1>
      </div>
      <form action="/admin/members" className={styles.search} role="search">
        <AdminIcon name="magnifying-glass" size={20} />
        <input name="q" type="search" placeholder="Cari member, sesi, order…" aria-label="Cari" className={styles.searchInput} />
        <kbd className={styles.kbd}>⌘K</kbd>
      </form>
      <button type="button" className={styles.iconButton} aria-label="Notifikasi">
        <AdminIcon name="bell-simple" size={20} />
        <span className={styles.notifDot} aria-hidden />
      </button>
    </header>
  );
}
