/**
 * Galeri foto sesi (dummy) — struktur mengikuti tabel `photos` + `photo_tags` di PRD.
 * Foto dari Figma "Vanue detail" (25:917), semuanya diambil di Common Grounds Menteng.
 */

export type AvatarTone = "lime" | "pink" | "indigo";

export type TaggedMember = {
  handle: string;
  initial: string;
  tone: AvatarTone;
  verified?: boolean;
};

export type GalleryPhoto = {
  id: string;
  venueSlug: string;
  src: string;
  /** Crop foto di kartu galeri, dihitung dari posisi di Figma. */
  position: string;
  alt: string;
  /** Tanggal sesi (YYYY-MM-DD, waktu lokal venue). */
  date: string;
  members: TaggedMember[];
  caption: string;
};

const members = {
  dimas: { handle: "@dimasf", initial: "D", tone: "lime" },
  felisya: { handle: "@felisyafernanda", initial: "F", tone: "pink", verified: true },
  rizky: { handle: "@rizkyramadhan", initial: "R", tone: "lime" },
  arya: { handle: "@aryasoslay67", initial: "A", tone: "indigo", verified: true },
} satisfies Record<string, TaggedMember>;

const DF = [members.dimas, members.felisya];
const RA = [members.rizky, members.arya];

const IMG = "/images/gallery";
const VENUE = "common-grounds-menteng";
const DATE = "2026-09-20";

/** [posisi crop, member ter-tag, caption] — urutan = urutan kartu di Figma. */
const photos: [string, TaggedMember[], string][] = [
  ["50% 65%", DF, "High five dulu sebelum lanjut rally berikutnya."],
  ["44% 49%", DF, "Pemanasan santai, lalu langsung tancap gas."],
  ["37% 8%", RA, "Doubles pagi dengan tembok oranye khas Common Grounds."],
  ["30% 50%", [members.felisya], "Fokus, ready position, satu poin lagi."],
  ["50% 50%", DF, "Return yang bikin satu lapangan teriak."],
  ["29% 28%", RA, "Lari ke net — momen favorit fotografer kami."],
  ["50% 50%", DF, "Backhand dua tangan andalan."],
  ["50% 60%", DF, "Senyum dulu, servis kemudian."],
  ["43% 48%", RA, "Rally panjang yang akhirnya dimenangkan lob."],
  ["41% 65%", DF, "Satu sesi, satu foto bareng satu komunitas."],
  ["49% 50%", DF, "Istirahat sebentar di pinggir lapangan."],
  ["31% 50%", RA, "Ganti posisi — giliran doubles campuran."],
  ["50% 50%", DF, "Siap menyambut servis lawan."],
  ["64% 81%", DF, "Tos setelah poin terakhir."],
  ["73% 71%", [members.felisya], "Datang untuk main, pulang dengan teman baru."],
];

export const galleryPhotos: GalleryPhoto[] = photos.map(([position, tagged, caption], i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `${VENUE}-${n}`,
    venueSlug: VENUE,
    src: `${IMG}/photo-${n}.webp`,
    position,
    alt: `Foto sesi Soslay di Common Grounds Menteng (${tagged.map((m) => m.handle).join(", ")})`,
    date: DATE,
    members: tagged,
    caption,
  };
});

export function photosForVenue(venueSlug: string): GalleryPhoto[] {
  return galleryPhotos.filter((photo) => photo.venueSlug === venueSlug);
}
