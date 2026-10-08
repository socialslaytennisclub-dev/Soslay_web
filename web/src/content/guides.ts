/**
 * Participant Guide per venue (Figma 151:52 "Participant Guide — Common Ground Menteng").
 * Dirender di /venue/[slug]/guide. Venue lain cukup ditambah entri baru di `participantGuides`.
 */

const IMG = "/images/guide/common-grounds";

export type GuidePhoto = { src: string; alt: string; position?: string };

export type ParticipantGuide = {
  venueSlug: string;
  venueName: string;
  intro: string;
  /** Satu baris fakta di kartu info hero. */
  facts: string[];
  /** Catatan tulisan tangan (font Caveat) di kartu hero. */
  note: string;
  hero: GuidePhoto;
  /** Warna khas venue — dipakai panel "Court Vibe" & aksen tulisan tangan. */
  theme: { panel: string; ink: string };
  outfit: {
    title: string;
    body: string;
    palette: { name: string; role: string; hex: string }[];
    avoid: { name: string; hex: string }[];
    avoidNote: string;
    looks: { title: string; caption: string; photo: GuidePhoto }[];
  };
  bring: {
    title: string;
    body: string;
    items: { name: string; note: string; optional?: boolean }[];
  };
  photoReference: {
    title: string[];
    body: string;
    /** 3 kolom masonry: [tinggi, pendek] · [pendek, tinggi] · [tinggi, pendek]. */
    columns: { label: string; photo: GuidePhoto }[][];
  };
  courtVibe: {
    title: string;
    body: string;
    palette: { name: string; hex: string; dark?: boolean }[];
    note: string;
    feature: GuidePhoto;
    side: GuidePhoto[];
    strip: GuidePhoto[];
  };
  tips: {
    title: string;
    items: { title: string; body: string }[];
  };
  cta: { title: string; body: string; label: string; href: string };
};

export const guideSections = [
  { id: "outfit", label: "Outfit" },
  { id: "barang-bawaan", label: "Barang Bawaan" },
  { id: "photo-reference", label: "Photo Reference" },
  { id: "court-vibe", label: "Court Vibe" },
  { id: "quick-tips", label: "Quick Tips" },
] as const;

export const participantGuides: ParticipantGuide[] = [
  {
    venueSlug: "common-grounds-menteng",
    venueName: "Common Ground Menteng",
    intro: "Semua yang perlu kamu tahu sebelum turun ke court — dari outfit, barang bawaan, sampai suasana venue-nya.",
    facts: ["Outdoor", "Court bertembok terakota", "Jakarta Pusat"],
    note: "warm walls, soft light, very photogenic ✦",
    hero: { src: `${IMG}/hero.webp`, alt: "Member Soslay melompat bersama di depan dinding terakota Common Ground Menteng", position: "50% 45%" },
    theme: { panel: "#c4673f", ink: "#8f4429" },
    outfit: {
      title: "Mau pakai apa?",
      body: "Putih bersih dan krem paling “nyala” di depan dinding terakota. Tambahkan sedikit navy atau sage biar look-nya tetap grounded — clean, tonal, tennis-club chic.",
      palette: [
        { name: "Optic White", role: "Base", hex: "#ffffff" },
        { name: "Ecru Cream", role: "Layer", hex: "#efe6d2" },
        { name: "Deep Navy", role: "Kontras", hex: "#1b2547" },
        { name: "Sage", role: "Aksen", hex: "#9aa67e" },
      ],
      avoid: [
        { name: "Terakota", hex: "#c4673f" },
        { name: "Blush", hex: "#e8b4b0" },
        { name: "Lilac", hex: "#b9a3c4" },
        { name: "Tan", hex: "#c9a27e" },
      ],
      avoidNote: "Warna-warna ini nyaru dengan dinding & court, jadi kamu “hilang” di foto.",
      looks: [
        { title: "Pleats + cap", caption: "Dress tenis putih, cap & kaos kaki putih", photo: { src: `${IMG}/outfit-pleats.webp`, alt: "Member memakai dress tenis putih dan cap" } },
        { title: "Polo + navy", caption: "Polo putih, celana navy/hitam", photo: { src: `${IMG}/outfit-polo.webp`, alt: "Member memakai polo putih dan celana gelap" } },
        { title: "All-cream", caption: "Polo & shorts krem, sneakers bersih", photo: { src: `${IMG}/outfit-cream.webp`, alt: "Member memakai polo dan shorts krem" } },
        { title: "Matching duo", caption: "Kompak serba putih bareng partner", photo: { src: `${IMG}/outfit-duo.webp`, alt: "Dua member memakai outfit putih senada" } },
      ],
    },
    bring: {
      title: "Yang perlu dibawa",
      body: "Bawa yang esensial, sisanya biar kami yang urus. Court-nya outdoor dan dikelilingi tembok, jadi siapkan perlindungan dari matahari.",
      items: [
        { name: "Raket", note: "Bawa cadangan kalau punya" },
        { name: "Sepatu tenis", note: "Sol non-marking" },
        { name: "Kaos kaki putih", note: "Bikin outfit makin clean" },
        { name: "Botol minum", note: "Court-nya hangat — isi penuh" },
        { name: "Handuk kecil", note: "Buat di sela-sela game" },
        { name: "Sunscreen", note: "Dinding memantulkan sinar matahari" },
        { name: "Topi / visor", note: "Wajib kalau main sore" },
        { name: "Kacamata hitam", note: "Bonus: bagus di foto", optional: true },
        { name: "Kaos ganti", note: "Buat nongkrong setelah main", optional: true },
      ],
    },
    photoReference: {
      title: ["Ini mood foto", "yang kami kejar."],
      body: "Bukan daftar foto yang pasti kamu dapat — ini gambaran suasana dan gaya foto di sesi Soslay: momen asli, cahaya hangat, putih di atas terakota.",
      columns: [
        [
          { label: "In action", photo: { src: `${IMG}/ref-in-action.webp`, alt: "Member melakukan servis di court", position: "60% 45%" } },
          { label: "The little details", photo: { src: `${IMG}/ref-details.webp`, alt: "Kaki pemain dan bayangan di court", position: "50% 55%" } },
        ],
        [
          { label: "With your people", photo: { src: `${IMG}/ref-people.webp`, alt: "Dua member saling tos setelah rally", position: "50% 62%" } },
          { label: "Portrait", photo: { src: `${IMG}/ref-portrait.webp`, alt: "Potret member berjalan di court sambil tersenyum", position: "50% 55%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${IMG}/ref-motion.webp`, alt: "Foto blur gerakan pemain mengejar bola", position: "45% 45%" } },
          { label: "Candid moments", photo: { src: `${IMG}/ref-candid.webp`, alt: "Member berbincang santai di pinggir net", position: "50% 58%" } },
        ],
      ],
    },
    courtVibe: {
      title: "Tempat kamu akan bermain.",
      body: "Dinding terakota yang hangat, court berwarna mauve, dan pohon willow yang menjuntai dari atas tembok — sebuah courtyard tenang yang tersembunyi di tengah Menteng.",
      palette: [
        { name: "Terakota", hex: "#8f4429", dark: true },
        { name: "Mauve court", hex: "#9a7383", dark: true },
        { name: "Willow", hex: "#7e8c55", dark: true },
        { name: "Golden light", hex: "#f2c7a5" },
        { name: "Garis putih", hex: "#ffffff" },
      ],
      note: "golden hour hits different here ↗",
      feature: { src: `${IMG}/court-main.webp`, alt: "Court mauve dengan dinding terakota dan pohon willow" },
      side: [
        { src: `${IMG}/court-window.webp`, alt: "Pemandangan court dari balik jendela" },
        { src: `${IMG}/court-corridor.webp`, alt: "Dua pemain di court dilihat dari lorong" },
      ],
      strip: [
        { src: `${IMG}/court-lounge.webp`, alt: "Area lounge di samping court" },
        { src: `${IMG}/court-bench.webp`, alt: "Bangku kayu dan pohon willow di tepi court" },
        { src: `${IMG}/court-lines.webp`, alt: "Garis putih di permukaan court mauve" },
      ],
    },
    tips: {
      title: "Sebelum kamu datang.",
      items: [
        { title: "Datang photo-ready", body: "Putih & krem, sneakers bersih. Navy kalau mau kontras." },
        { title: "Lawan silau", body: "Tembok memantulkan matahari sore — pakai topi/visor + SPF." },
        { title: "Minum dari awal", body: "Court bertembok menahan panas. Bawa botol penuh." },
        { title: "Jaga venue", body: "Ruang bersama: lounge tetap rapi, vibe tetap ramah." },
        { title: "Sapa orang baru", body: "Datang buat tenis, pulang bawa teman baru. Have fun!" },
      ],
    },
    cta: {
      title: "Siap main di Common Ground Menteng?",
      body: "Amankan slot kamu dan sampai jumpa di court — jangan lupa outfit putihnya.",
      label: "Booking Session di Kuyy",
      href: "https://kuy.id/soslay",
    },
  },
];

export function findGuide(venueSlug: string): ParticipantGuide | undefined {
  return participantGuides.find((guide) => guide.venueSlug === venueSlug);
}

export function guideHref(venueSlug: string): string {
  return `/venue/${venueSlug}/guide`;
}

/** Ajakan kecil di halaman Activity untuk peserta baru (mengarah ke panduan yang tersedia). */
export const guidePrompt = {
  question: "Baru pertama ikut?",
  label: "Panduan peserta",
  href: guideHref(participantGuides[0].venueSlug),
};
