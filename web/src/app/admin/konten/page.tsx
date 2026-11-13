import type { Metadata } from "next";
import Link from "next/link";
import { CommunityPosts } from "@/components/admin/content/CommunityPosts";
import { GalleryManager } from "@/components/admin/content/GalleryManager";
import { TestimonialManager } from "@/components/admin/content/TestimonialManager";
import styles from "@/components/admin/content/Content.module.css";
import { HomepageEditor } from "@/components/admin/content/HomepageEditor";
import { SitePages } from "@/components/admin/content/SitePages";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { emptyTestimonial, listCommunityPosts, listGallery, listHomepageSections, listSitePages, listTestimonials } from "@/server/admin/content-repo";
import { memberChoices } from "@/server/admin/repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Konten & Galeri" };

const TABS = ["homepage", "gallery", "community", "pages"] as const;
type Tab = (typeof TABS)[number];
const num = new Intl.NumberFormat("id-ID");

/** Admin / 08 Konten & Galeri (Figma 25:5873). */
export default async function AdminContentPage({ searchParams }: PageProps<"/admin/konten">) {
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t === (Array.isArray(raw) ? raw[0] : raw)) ?? "homepage";
  const [sections, gallery, posts, pages, testimonials, members] = await Promise.all([
    listHomepageSections(),
    // Daftar activity + peserta (untuk upload & tag) hanya dibutuhkan di tab Galeri foto.
    listGallery({ withActivities: tab === "gallery" }),
    listCommunityPosts(),
    listSitePages(),
    listTestimonials(),
    // Pilihan "Hubungkan ke member" (testimoni & post) — hanya di tab Testimoni & IG.
    tab === "community" ? memberChoices() : Promise.resolve([]),
  ]);

  const tabs = (
    <nav className={styles.tabs} aria-label="Bagian konten">
      {(
        [
          ["homepage", "Homepage", null],
          ["gallery", "Galeri foto", gallery.totalPhotos],
          ["community", "Testimoni & IG", posts.length + testimonials.length],
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

  const galleryCard = (preview?: number) => (
    <GalleryManager initial={gallery.photos} activities={gallery.activities} totalPhotos={gallery.totalPhotos} totalAlbums={gallery.totalAlbums} preview={preview} />
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
            {tab === "community" && (
              <>
                <TestimonialManager initial={testimonials} members={members} empty={emptyTestimonial()} />
                <CommunityPosts initial={posts} members={members} />
              </>
            )}
            {tab === "pages" && <SitePages pages={pages} />}
          </>
        )}
      </div>
    </>
  );
}
