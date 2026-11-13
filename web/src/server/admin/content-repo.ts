import "server-only";
import { galleryPhotos } from "@/content/gallery";
import { activities, community, hero, instagram, marquee, shop, stats, venues } from "@/content/home";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset } from "./dataset";
import { DAY } from "./time";
import { DEMO_NOW } from "./demo-data";
import type { AdminGalleryPhoto, AdminTestimonial, CommunityPost, ContentSection, GalleryActivity, SitePage } from "./types";
import type { InstagramSectionJson } from "@/lib/community-posts";
import { postsFromSection, readInstagramSection } from "../community-posts";

/**
 * Data Konten & Galeri (content_sections, photo_albums, photos, testimonials). Isi awal diambil
 * dari konten website yang sekarang; draft/publish tersimpan setelah Supabase tersambung.
 */


type SectionRow = { key: string; label: string; draft: Partial<ContentSection> & { hiddenPosts?: string[] }; published: unknown; is_enabled: boolean; sort_order: number; published_at: string | null };

/** Section homepage untuk editor: default + draft dari tabel content_sections (urutan & aktif dari tabel). */
export async function listHomepageSections(): Promise<ContentSection[]> {
  const defaults = defaultHomepageSections();
  if (!isSupabaseConfigured) return defaults;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("content_sections").select("key, label, draft, published, is_enabled, sort_order, published_at").eq("page", "home").order("sort_order");
  const rows = (data ?? []) as SectionRow[];
  if (!rows.length) return defaults;
  const known = rows.flatMap((r) => {
    const base = defaults.find((d) => d.key === r.key);
    if (!base) return [];
    const d = r.draft ?? {};
    return [
      {
        ...base,
        name: r.label || base.name,
        // Jumlah post diambil dari daftar yang dikelola di tab Testimoni & IG.
        summary: r.key === "instagram" ? postSummary(r.published as InstagramSectionJson | null) : base.summary,
        enabled: r.is_enabled,
        title: d.title ?? base.title,
        description: d.description ?? base.description,
        cta: d.cta ?? base.cta,
        image: d.image ?? base.image,
        overlay: d.overlay ?? base.overlay,
        unpublished: JSON.stringify(r.draft) !== JSON.stringify(r.published),
      } satisfies ContentSection,
    ];
  });
  // Section baru di kode yang belum ada di tabel → tampil di akhir.
  return [...known, ...defaults.filter((d) => !rows.some((r) => r.key === d.key))];
}

/** "5 post · 4 tampil · kelola di Testimoni & IG" untuk kartu section Instagram. */
function postSummary(json: InstagramSectionJson | null): string {
  const posts = postsFromSection(json);
  return `${posts.length} post · ${posts.filter((p) => p.visible).length} tampil · kelola di tab Testimoni & IG`;
}

function defaultHomepageSections(): ContentSection[] {
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
      summary: postSummary(null),
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

/** Activity bisa diberi foto setelah dimulai; pilihan upload dibatasi 120 hari terakhir. */
const GALLERY_WINDOW_DAYS = 120;
const PARTICIPANT_STATUSES = new Set(["registered", "attended"]);

/**
 * Galeri foto sesi (tabel photos): daftar foto + activity yang bisa diberi foto (dengan pesertanya untuk tag).
 * Mode demo: foto contoh dari content/gallery, dikaitkan ke activity Common Grounds terakhir.
 */
export async function listGallery(): Promise<{ photos: AdminGalleryPhoto[]; activities: GalleryActivity[]; totalPhotos: number; totalAlbums: number }> {
  const { sessions, bookings, members, now } = await getDataset();
  const byId = new Map(members.map((m) => [m.id, m]));
  const since = now.getTime() - GALLERY_WINDOW_DAYS * DAY;
  const activities: GalleryActivity[] = sessions
    .filter((s) => (s.status === "published" || s.status === "completed") && s.startsAt.getTime() <= now.getTime() && s.startsAt.getTime() >= since)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .map((s) => ({
      id: s.id,
      title: s.title,
      venueName: s.venueName,
      startsAt: s.startsAt.toISOString(),
      participants: bookings
        .filter((b) => b.sessionId === s.id && PARTICIPANT_STATUSES.has(b.status))
        .flatMap((b) => {
          const m = byId.get(b.memberId);
          return m ? [{ id: m.id, name: m.fullName, instagram: m.instagram }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name, "id")),
    }));

  if (!isSupabaseConfigured) {
    const demo = activities.find((a) => a.venueName.startsWith("Common Grounds")) ?? activities[0];
    const photos = galleryPhotos.map((p, i): AdminGalleryPhoto => ({
      id: p.id,
      url: p.src,
      caption: p.caption,
      sessionId: demo?.id ?? null,
      activity: { title: demo?.title ?? "Activity", venueName: demo?.venueName ?? "Common Grounds Menteng", date: demo?.startsAt ?? `${p.date}T00:00:00Z` },
      // Contoh: tag peserta activity tersebut (demo) supaya bisa dicoba di editor.
      members: (demo?.participants ?? []).slice(i % 3, (i % 3) + 1 + (i % 2)).map((m) => ({ id: m.id, name: m.name })),
      createdAt: `${p.date}T12:00:00Z`,
    }));
    return { photos, activities, totalPhotos: photos.length, totalAlbums: demo ? 1 : 0 };
  }

  type Row = {
    id: string;
    path: string;
    caption: string | null;
    created_at: string;
    photo_albums: { session_id: string | null; title: string; taken_on: string; venues: { name: string } | null } | null;
    photo_tags: { member_id: string }[];
  };
  const supabase = await createSupabaseServerClient();
  const [{ data }, { count: albumCount }, { count: photoCount }] = await Promise.all([
    supabase
      .from("photos")
      .select("id, path, caption, created_at, photo_albums(session_id, title, taken_on, venues(name)), photo_tags(member_id)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("photo_albums").select("id", { count: "exact", head: true }),
    supabase.from("photos").select("id", { count: "exact", head: true }),
  ]);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const photos = ((data ?? []) as unknown as Row[]).map((r): AdminGalleryPhoto => {
    const album = r.photo_albums;
    const session = album?.session_id ? sessionById.get(album.session_id) : undefined;
    return {
      id: r.id,
      url: r.path,
      caption: r.caption ?? "",
      sessionId: album?.session_id ?? null,
      activity: {
        title: session?.title ?? album?.title ?? "Activity",
        venueName: session?.venueName ?? album?.venues?.name ?? "",
        date: session?.startsAt.toISOString() ?? `${album?.taken_on ?? r.created_at.slice(0, 10)}T00:00:00+07:00`,
      },
      members: r.photo_tags.map((t) => ({ id: t.member_id, name: byId.get(t.member_id)?.fullName ?? "Member" })),
      createdAt: r.created_at,
    };
  });
  return { photos, activities, totalPhotos: photoCount ?? photos.length, totalAlbums: albumCount ?? 0 };
}

/** Post Instagram, TikTok & Threads di feed "See You on the Court!" (tambah / ubah / hapus / tampil). */
export async function listCommunityPosts(): Promise<CommunityPost[]> {
  if (!isSupabaseConfigured) return postsFromSection(null);
  return postsFromSection(await readInstagramSection(await createSupabaseServerClient()));
}

/** Testimoni untuk tab Testimoni & IG (CRUD). Demo: kutipan statis homepage + 2 contoh tersembunyi. */
export async function listTestimonials(): Promise<AdminTestimonial[]> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("testimonials")
      .select("id, kind, author_name, author_handle, quote, avatar_path, member_id, sort_order, is_published, video_url, video_platform, duration_seconds, created_at")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(`Gagal memuat testimoni: ${error.message}`);
    return (data ?? []).map((t) => ({
      id: t.id as string,
      kind: (t.kind as AdminTestimonial["kind"]) ?? "text",
      name: t.author_name as string,
      handle: (t.author_handle as string | null) ?? "",
      quote: t.quote as string,
      avatar: (t.avatar_path as string | null) ?? null,
      memberId: (t.member_id as string | null) ?? null,
      sortOrder: t.sort_order as number,
      visible: t.is_published as boolean,
      videoUrl: (t.video_url as string | null) ?? null,
      videoPlatform: (t.video_platform as AdminTestimonial["videoPlatform"]) ?? null,
      durationSeconds: (t.duration_seconds as number | null) ?? null,
      createdAt: t.created_at as string,
    }));
  }
  const at = new Date(DEMO_NOW.getTime() - 14 * DAY).toISOString();
  const base = (i: number, name: string, handle: string, quote: string, visible: boolean, avatar?: string): AdminTestimonial => ({
    id: `t${i}`, kind: "text", name, handle, quote, avatar: avatar ?? null, memberId: null, sortOrder: i, visible, videoUrl: null, videoPlatform: null, durationSeconds: null, createdAt: at,
  });
  return [
    ...community.testimonials.map((t, i) => base(i + 1, t.name.replace(/^@/, ""), t.name.startsWith("@") ? t.name : "", t.quote, true, t.avatar)),
    base(6, "Nadia Salsabila", "@nadiasalsa", "My first Beginner Coaching session — the coach was so patient. Now I'm confident enough to join mabar.", false),
  ];
}

export function emptyTestimonial(): AdminTestimonial {
  return { id: "", kind: "text", name: "", handle: "", quote: "", avatar: null, memberId: null, sortOrder: 0, visible: true, videoUrl: null, videoPlatform: null, durationSeconds: null, createdAt: "" };
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
