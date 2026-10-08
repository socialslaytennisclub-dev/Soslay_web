import "server-only";
import { galleryPhotos } from "@/content/gallery";
import { activities, community, hero, instagram, marquee, shop, stats, venues } from "@/content/home";
import { getDataset } from "./dataset";
import { DAY } from "./time";
import { activityTypeLabels, DEMO_NOW } from "./demo-data";
import type { CommunityPost, ContentSection, PhotoAlbum, SitePage } from "./types";

/**
 * Data Konten & Galeri (content_sections, photo_albums, photos, testimonials). Isi awal diambil
 * dari konten website yang sekarang; draft/publish tersimpan setelah Supabase tersambung.
 */


export async function listHomepageSections(): Promise<ContentSection[]> {
  return [
    {
      key: "hero",
      name: "Hero",
      icon: "image",
      summary: `${hero.title} · ${hero.description[0]}`,
      enabled: true,
      title: hero.title,
      description: hero.description.join(" "),
      maxLength: 180,
      cta: hero.cta,
      image: hero.image.src,
      overlay: true,
    },
    {
      key: "activities",
      name: "Lebih dari Sekadar Pertandingan",
      icon: "calendar-dots",
      summary: `${activities.items.length} kartu aktivitas · otomatis dari Activities`,
      enabled: true,
      title: activities.title,
      description: activities.description,
      maxLength: 200,
      cta: activities.cta,
      source: { label: "Activities", href: "/admin/activities" },
    },
    {
      key: "stats",
      name: "Statistik",
      icon: "trend-up",
      summary: stats.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(" · "),
      enabled: true,
      title: "Statistik",
      description: stats.map((s) => `${s.value} ${s.label}`).join("\n"),
      maxLength: 200,
    },
    {
      key: "venues",
      name: "Venue pilihan",
      icon: "map-pin",
      summary: `${venues.items.length} venue tampil · otomatis dari Venues`,
      enabled: true,
      title: venues.title,
      description: venues.description,
      maxLength: 240,
      cta: venues.cta,
      source: { label: "Venues", href: "/admin/venues" },
    },
    {
      key: "community",
      name: "The People Make the Game",
      icon: "users-three",
      summary: `Testimoni komunitas · ${community.testimonials.length} kutipan`,
      enabled: true,
      title: community.title.join(" "),
      description: community.description,
      maxLength: 200,
      cta: community.cta,
      source: { label: "Testimoni & IG", href: "/admin/konten?tab=community" },
    },
    {
      key: "marquee",
      name: "Marquee",
      icon: "text-t",
      summary: marquee.text,
      enabled: true,
      title: marquee.text,
      description: "",
      maxLength: 60,
    },
    {
      key: "shop",
      name: "Beyond the Court (Shop)",
      icon: "storefront",
      summary: `${shop.products.length} produk unggulan · otomatis dari Products`,
      enabled: true,
      title: shop.title,
      description: shop.description,
      maxLength: 200,
      cta: shop.cta,
      source: { label: "Products", href: "/admin/products" },
    },
    {
      key: "instagram",
      name: "See You on the Court!",
      icon: "instagram-logo",
      summary: `${instagram.posts.length} post Instagram · kurasi manual`,
      enabled: true,
      title: instagram.title,
      description: instagram.description,
      maxLength: 200,
      cta: instagram.cta,
      source: { label: "Testimoni & IG", href: "/admin/konten?tab=community" },
    },
    {
      key: "promo",
      name: "Promo banner",
      icon: "tag",
      summary: "Destination Series drop · 10 Okt",
      enabled: false,
      title: "Destination Series — drop 10 Oktober",
      description: "Koleksi baru terinspirasi dari Bali dan Jakarta. Stok terbatas.",
      maxLength: 120,
      cta: { label: "Lihat koleksi", href: "/shop" },
      scheduleNote: "Tampil otomatis mulai 10 Okt 2026",
    },
  ];
}

const COVERS = [
  "/images/home/activity-weekly-mabar.webp",
  "/images/home/activity-beginner-coaching.webp",
  "/images/home/community-group.webp",
  "/images/home/activity-match-day.webp",
  "/images/home/community-highfive.webp",
  "/images/home/activity-tennis-escape.webp",
  ...galleryPhotos.map((p) => p.src),
];

/** Album foto per sesi selesai. Sesi < 1 hari belum diupload, < 2 hari masih draft (kurasi). */
export async function listAlbums(limit?: number): Promise<{ albums: PhotoAlbum[]; totalPhotos: number; totalAlbums: number }> {
  // Galeri foto sesi mulai berjalan 6 minggu terakhir; sesi lebih lama belum punya album.
  const { sessions, now } = await getDataset();
  const since = now.getTime() - 6 * 7 * DAY;
  const done = sessions.filter((s) => s.status === "completed" && s.startsAt.getTime() >= since).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const albums = done.map((s, i): PhotoAlbum => {
    const age = (now.getTime() - s.endsAt.getTime()) / DAY;
    const seed = Number(s.id.replace(/\D/g, "")) || i;
    const status = age < 1 ? "empty" : age < 2 ? "draft" : "published";
    return {
      id: `album-${s.id}`,
      sessionId: s.id,
      title: s.venueName.includes("Altitude") || s.venueName.includes("Bali") ? `${activityTypeLabels[s.typeSlug] ?? s.title} di Bali` : (activityTypeLabels[s.typeSlug] ?? s.title),
      venueName: s.venueName,
      date: s.startsAt.toISOString(),
      photoCount: status === "empty" ? 0 : 36 + (seed * 37) % 90,
      cover: COVERS[seed % COVERS.length],
      status,
    };
  });
  const uploaded = albums.filter((a) => a.status !== "empty");
  return {
    albums: limit ? albums.slice(0, limit) : albums,
    totalPhotos: uploaded.reduce((sum, a) => sum + a.photoCount, 0),
    totalAlbums: uploaded.length,
  };
}

export async function listCommunityPosts(): Promise<CommunityPost[]> {
  return [
    ...community.testimonials.map((t, i): CommunityPost => ({ id: `t${i}`, kind: "testimonial", text: t.quote, handle: t.name, image: t.avatar, visible: true })),
    ...instagram.posts.map((p, i): CommunityPost => ({ id: `ig${i}`, kind: p.platform, text: p.text.join(" "), handle: p.handle, image: p.image, visible: true })),
    { id: "t-new1", kind: "testimonial", text: "Pertama kali ikut Beginner Coaching, coach-nya sabar banget. Sekarang udah berani ikut mabar.", handle: "@nadiasalsa", visible: false },
    { id: "t-new2", kind: "testimonial", text: "Tennis Escape ke Bali kemarin jadi trip terbaik tahun ini.", handle: "@gilanghermawan", visible: false },
  ];
}

export async function listSitePages(): Promise<SitePage[]> {
  const d = (days: number) => new Date(DEMO_NOW.getTime() - days * DAY).toISOString();
  return [
    { path: "/activity", name: "Activity", description: "Hero, filter tipe sesi, jadwal mendatang", updatedAt: d(1), updatedBy: "Rara" },
    { path: "/venue", name: "Venue", description: "Hero dan daftar venue Jakarta & Bali", updatedAt: d(6), updatedBy: "Rara" },
    { path: "/shop", name: "Shop", description: "Hero, kategori, produk", updatedAt: d(9), updatedBy: "Bima" },
    { path: "/venue/common-grounds-menteng/guide", name: "Panduan Peserta", description: "Panduan datang, parkir, dan check-in per venue", updatedAt: d(3), updatedBy: "Lia" },
    { path: "/masuk", name: "Masuk", description: "Foto dan copy halaman login", updatedAt: d(21), updatedBy: "Rara" },
    { path: "/daftar", name: "Daftar", description: "Foto dan copy halaman pendaftaran member", updatedAt: d(21), updatedBy: "Rara" },
  ];
}
