import type { Metadata } from "next";
import Link from "next/link";
import { AlbumGrid } from "@/components/admin/content/AlbumGrid";
import { CommunityPosts } from "@/components/admin/content/CommunityPosts";
import styles from "@/components/admin/content/Content.module.css";
import { HomepageEditor } from "@/components/admin/content/HomepageEditor";
import { SitePages } from "@/components/admin/content/SitePages";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import { listAlbums, listCommunityPosts, listHomepageSections, listSitePages } from "@/server/admin/content-repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Konten & Galeri" };

const TABS = ["homepage", "gallery", "community", "pages"] as const;
type Tab = (typeof TABS)[number];
const num = new Intl.NumberFormat("id-ID");

/** Admin / 08 Konten & Galeri (Figma 25:5873). */
export default async function AdminContentPage({ searchParams }: PageProps<"/admin/konten">) {
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t === (Array.isArray(raw) ? raw[0] : raw)) ?? "homepage";
  const [sections, gallery, posts, pages] = await Promise.all([listHomepageSections(), listAlbums(), listCommunityPosts(), listSitePages()]);

  const tabs = (
    <nav className={styles.tabs} aria-label="Bagian konten">
      {(
        [
          ["homepage", "Homepage", null],
          ["gallery", "Galeri foto", gallery.totalPhotos],
          ["community", "Testimoni & IG", posts.length],
          ["pages", "Halaman lain", pages.length],
        ] as const
      ).map(([value, label, count]) => (
        <Link
          key={value}
          href={value === "homepage" ? "/admin/konten" : `/admin/konten?tab=${value}`}
          className={cx(styles.tab, tab === value && styles.tabActive)}
          aria-current={tab === value ? "page" : undefined}
        >
          {label}
          {count !== null && <span className={styles.tabCount}>{num.format(count)}</span>}
        </Link>
      ))}
    </nav>
  );

  const galleryCard = (limit?: number) => (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Galeri foto sesi</h2>
          <p className={styles.muted}>
            {num.format(gallery.totalPhotos)} foto · {gallery.totalAlbums} album · tampil di member dashboard & halaman venue
          </p>
        </div>
        <AdminButton variant="primary" size="sm" icon="upload-simple" disabled title="Upload aktif setelah Supabase Storage tersambung">
          Upload foto
        </AdminButton>
      </header>
      <AlbumGrid albums={limit ? gallery.albums.slice(0, limit) : gallery.albums.slice(0, 40)} />
      {limit ? (
        <AdminButton href="/admin/konten?tab=gallery" size="sm" className={styles.more} iconAfter="caret-right">
          Lihat semua album
        </AdminButton>
      ) : (
        gallery.albums.length > 40 && <p className={cx(styles.muted, styles.more)}>Menampilkan 40 album terbaru dari {gallery.albums.length}</p>
      )}
    </section>
  );

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Konten & Galeri" title="Konten & Galeri" />
      <div className={pageStyles.content}>
        {tab === "homepage" ? (
          <>
            <HomepageEditor initial={sections} tabs={tabs} />
            {galleryCard(5)}
          </>
        ) : (
          <>
            <div className={styles.toolbar}>{tabs}</div>
            {tab === "gallery" && galleryCard()}
            {tab === "community" && <CommunityPosts initial={posts} />}
            {tab === "pages" && <SitePages pages={pages} />}
          </>
        )}
      </div>
    </>
  );
}
