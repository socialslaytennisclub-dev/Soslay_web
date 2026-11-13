/**
 * Participant Guide per venue (Figma 151:52 "Participant Guide — Common Grounds Menteng").
 * Dirender di /venue/[slug]/guide. Venue lain cukup ditambah entri baru di `participantGuides`.
 */

const IMG = "/images/guide/common-grounds";
const RANA = "/images/guide/rana-grounds";

export type GuidePhoto = { src: string; alt: string; position?: string };

export type ParticipantGuide = {
  venueSlug: string;
  // Nama venue diambil dari master venue (halaman guide memakai venue.name).
  intro: string;
  // Kartu info hero (tipe · warna court · kota, dan tagline + ✦) diambil dari master venue — lihat venueCardInfo.
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
    /** 2 foto (bertumpuk) atau 3 foto (2 berdampingan + 1 lebar di bawahnya). */
    side: GuidePhoto[];
    /** Baris foto di bawah panel — boleh kosong. */
    strip: GuidePhoto[];
  };
  tips: {
    title: string;
    items: { title: string; body: string }[];
  };
};

export const participantGuides: ParticipantGuide[] = [
  {
    venueSlug: "common-grounds-menteng",
    intro: "A hidden tennis courtyard in the heart of Menteng. Check upcoming sessions, the participant guide, and highlights from past sessions — all on one page.",
    hero: { src: `${IMG}/hero.webp`, alt: "Soslay members jumping together in front of the terracotta wall at Common Grounds Menteng", position: "50% 45%" },
    theme: { panel: "#c4673f", ink: "#8f4429" },
    outfit: {
      title: "What to wear?",
      body: "Crisp white and cream really “pop” against the terracotta walls. Add a touch of navy or sage to keep the look grounded — clean, tonal, tennis-club chic.",
      palette: [
        { name: "Optic White", role: "Base", hex: "#ffffff" },
        { name: "Ecru Cream", role: "Layer", hex: "#efe6d2" },
        { name: "Deep Navy", role: "Contrast", hex: "#1b2547" },
        { name: "Sage", role: "Accent", hex: "#9aa67e" },
      ],
      avoid: [
        { name: "Terracotta", hex: "#c4673f" },
        { name: "Blush", hex: "#e8b4b0" },
        { name: "Lilac", hex: "#b9a3c4" },
        { name: "Tan", hex: "#c9a27e" },
      ],
      avoidNote: "These colors blend into the walls & court, so you “disappear” in photos.",
      looks: [
        { title: "Pleats + cap", caption: "White tennis dress, cap & white socks", photo: { src: `${IMG}/outfit-pleats.webp`, alt: "Member wearing a white tennis dress and cap" } },
        { title: "Polo + navy", caption: "White polo, navy/black bottoms", photo: { src: `${IMG}/outfit-polo.webp`, alt: "Member wearing a white polo and dark bottoms" } },
        { title: "All-cream", caption: "Cream polo & shorts, clean sneakers", photo: { src: `${IMG}/outfit-cream.webp`, alt: "Member wearing a cream polo and shorts" } },
        { title: "Matching duo", caption: "Matching all-white with your partner", photo: { src: `${IMG}/outfit-duo.webp`, alt: "Two members in matching white outfits" } },
      ],
    },
    bring: {
      title: "What to bring",
      body: "Bring the essentials, we'll handle the rest. The court is outdoors and walled in, so come prepared for the sun.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles" },
        { name: "White socks", note: "Keeps your outfit extra clean" },
        { name: "Water bottle", note: "The court gets warm — fill it up" },
        { name: "Small towel", note: "For breaks between games" },
        { name: "Sunscreen", note: "The walls reflect the sun" },
        { name: "Cap / visor", note: "A must for afternoon sessions" },
        { name: "Sunglasses", note: "Bonus: they look great in photos", optional: true },
        { name: "Change of shirt", note: "For hanging out after the game", optional: true },
      ],
    },
    photoReference: {
      title: ["This is the photo mood", "we're after."],
      body: "Not a list of shots you're guaranteed to get — this is the vibe and style of photos at Soslay sessions: real moments, warm light, white against terracotta.",
      columns: [
        [
          { label: "In action", photo: { src: `${IMG}/ref-in-action.webp`, alt: "A member serving on court", position: "60% 45%" } },
          { label: "The little details", photo: { src: `${IMG}/ref-details.webp`, alt: "A player's feet and shadow on court", position: "50% 55%" } },
        ],
        [
          { label: "With your people", photo: { src: `${IMG}/ref-people.webp`, alt: "Two members high-fiving after a rally", position: "50% 62%" } },
          { label: "Portrait", photo: { src: `${IMG}/ref-portrait.webp`, alt: "Portrait of a member smiling while walking on court", position: "50% 55%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${IMG}/ref-motion.webp`, alt: "Motion-blurred player chasing the ball", position: "45% 45%" } },
          { label: "Candid moments", photo: { src: `${IMG}/ref-candid.webp`, alt: "Members chatting by the net", position: "50% 58%" } },
        ],
      ],
    },
    courtVibe: {
      title: "Where you'll be playing.",
      body: "Warm terracotta walls, a mauve court, and willow trees draping over the walls — a quiet courtyard hidden in the heart of Menteng.",
      palette: [
        { name: "Terracotta", hex: "#8f4429", dark: true },
        { name: "Mauve court", hex: "#9a7383", dark: true },
        { name: "Willow", hex: "#7e8c55", dark: true },
        { name: "Golden light", hex: "#f2c7a5" },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "golden hour hits different here ↗",
      feature: { src: `${IMG}/court-main.webp`, alt: "Mauve court with terracotta walls and willow trees" },
      side: [
        { src: `${IMG}/court-window.webp`, alt: "View of the court through a window" },
        { src: `${IMG}/court-corridor.webp`, alt: "Two players on court seen from the corridor" },
      ],
      strip: [
        { src: `${IMG}/court-lounge.webp`, alt: "Lounge area next to the court" },
        { src: `${IMG}/court-bench.webp`, alt: "Wooden bench and willow tree by the court" },
        { src: `${IMG}/court-lines.webp`, alt: "White lines on the mauve court surface" },
      ],
    },
    tips: {
      title: "Before you arrive.",
      items: [
        { title: "Show up photo-ready", body: "White & cream, clean sneakers. Navy if you want contrast." },
        { title: "Beat the glare", body: "The walls reflect the afternoon sun — wear a cap/visor + SPF." },
        { title: "Hydrate early", body: "Walled courts trap heat. Bring a full bottle." },
        { title: "Respect the venue", body: "It's a shared space: keep the lounge tidy and the vibe friendly." },
        { title: "Say hi to someone new", body: "Come for tennis, leave with new friends. Have fun!" },
      ],
    },
  },
  /** Figma 2377:2 "Participant Guide — Rana Grounds Mampang". */
  {
    venueSlug: "rana-grounds",
    intro: "Everything you need to know before you step on court — what to wear, what to bring, and what the venue feels like.",
    hero: { src: `${RANA}/hero.webp`, alt: "Soslay members rallying on the synthetic grass court under the white arched roof at Rana Grounds", position: "50% 65%" },
    theme: { panel: "#5a7c40", ink: "#2f5a47" },
    outfit: {
      title: "What should I wear?",
      body: "Synthetic grass, a white arched roof and bright, airy light — this court was made for tennis whites. Go head-to-toe white or ivory. Skip greens and teals.",
      palette: [
        { name: "Optic White", role: "Your base", hex: "#ffffff" },
        { name: "Ivory", role: "Soft layer", hex: "#f3eee0" },
        { name: "Jet Black", role: "Contrast", hex: "#111111" },
      ],
      avoid: [
        { name: "Grass", hex: "#4f8a3c" },
        { name: "Teal", hex: "#174a46" },
        { name: "Mint", hex: "#9fd8c0" },
        { name: "Olive", hex: "#7a7f3a" },
      ],
      avoidNote:
        "Greens and teals melt into the grass and banners — let your whites do the talking. All-white crowd? Add texture — pleats, cable knit, a crisp collar — so your whites stand out from everyone else's.",
      looks: [
        { title: "White tennis dress", caption: "Simple white dress, white socks & sneakers", photo: { src: `${RANA}/outfit-dress.webp`, alt: "Member wearing a simple white tennis dress" } },
        { title: "Tee + pleated skirt", caption: "Graphic white tee, white pleated skirt", photo: { src: `${RANA}/outfit-skirt.webp`, alt: "Member wearing a white tee and pleated skirt" } },
        { title: "White + dark shorts", caption: "White tee, dark shorts, white cap", photo: { src: `${RANA}/outfit-shorts.webp`, alt: "Member wearing a white tee, dark shorts and a white cap" } },
        { title: "Wide-leg whites", caption: "White set, wide-leg pants, bucket hat", photo: { src: `${RANA}/outfit-wide-leg.webp`, alt: "Member wearing a white set with wide-leg pants and a bucket hat" } },
      ],
    },
    bring: {
      title: "What should I bring?",
      body: "Bring the essentials — we'll take care of the rest. The court is covered, so you're shaded — but it still gets warm and bright under the roof.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles" },
        { name: "White socks", note: "Keeps the look clean" },
        { name: "Water bottle", note: "It still gets warm under the roof" },
        { name: "Small towel", note: "For between games" },
        { name: "Hair tie / headband", note: "Keeps you cool mid-rally" },
        { name: "Grippy tennis shoes", note: "Made for synthetic grass" },
        { name: "Extra white layer", note: "For the after-session photos", optional: true },
        { name: "Spare tee", note: "For hanging out after", optional: true },
      ],
    },
    photoReference: {
      title: ["The mood we're", "shooting for."],
      body: "This isn't a shot list of specific photos — it's the kind of photography and visual mood we go for at Social Slay sessions: real moments, airy light, whites on green grass.",
      columns: [
        [
          { label: "In action", photo: { src: `${RANA}/ref-in-action.webp`, alt: "A member hitting a forehand on the grass court", position: "50% 50%" } },
          { label: "The little details", photo: { src: `${RANA}/ref-details.webp`, alt: "Close-up details of a player on court", position: "50% 50%" } },
        ],
        [
          { label: "With your people", photo: { src: `${RANA}/ref-people.webp`, alt: "Members celebrating together on court", position: "45% 65%" } },
          { label: "Portrait", photo: { src: `${RANA}/ref-portrait.webp`, alt: "Portrait of a member in tennis whites", position: "50% 100%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${RANA}/ref-motion.webp`, alt: "Motion-blurred player stretching for a ball under the roof", position: "50% 70%" } },
          { label: "Candid moments", photo: { src: `${RANA}/ref-candid.webp`, alt: "Members sharing a candid moment by the court", position: "50% 41%" } },
        ],
      ],
    },
    courtVibe: {
      title: "A glimpse of where you'll be playing.",
      body: "A covered court under a white arched roof, with lush synthetic grass, mesh walls and deep-teal Rana banners. Bright, airy light — and no sunburn.",
      palette: [
        { name: "Rana teal", hex: "#174a46", dark: true },
        { name: "Grass green", hex: "#4f8a3c", dark: true },
        { name: "White roof", hex: "#f2f0ea" },
        { name: "Coral logo", hex: "#e8735a", dark: true },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "grass-court energy, zero sunburn ↗",
      feature: { src: `${RANA}/court-main.webp`, alt: "Soslay members lined up with rackets on the grass court under the arched roof", position: "50% 100%" },
      side: [
        { src: `${RANA}/court-side-1.webp`, alt: "Sign by the court: the first synthetic grass tennis court in Jakarta", position: "50% 100%" },
        { src: `${RANA}/court-side-2.webp`, alt: "Close-up of the white lines on the synthetic grass", position: "50% 100%" },
        { src: `${RANA}/court-wide.webp`, alt: "A member walking on court in front of the Rana Grounds banner", position: "50% 40%" },
      ],
      strip: [],
    },
    tips: {
      title: "Before you come.",
      items: [
        { title: "Come photo-ready", body: "Head-to-toe white or ivory. Skip greens and teals." },
        { title: "Grass-court ready", body: "Synthetic grass — wear comfy tennis shoes with good grip." },
        { title: "Hydrate early", body: "It gets warm under the roof. Bring a full bottle." },
        { title: "Respect the venue", body: "It's a shared space — keep the lounge tidy and the vibe friendly." },
        { title: "Meet someone new", body: "Come for the tennis, stay for the people. Have fun!" },
      ],
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
  question: "First time joining?",
  label: "Participant guide",
  href: guideHref(participantGuides[0].venueSlug),
};
