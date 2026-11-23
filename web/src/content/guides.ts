/**
 * Participant Guide per venue (Figma 151:52 "Participant Guide — Common Grounds Menteng").
 * Dirender di /venue/[slug]/guide. Venue lain cukup ditambah entri baru di `participantGuides`.
 */

const IMG = "/images/guide/common-grounds";
const RANA = "/images/guide/rana-grounds";
const VALE = "/images/guide/vale-racquet";
const TEMPLE = "/images/guide/racquette-temple";
const OFF = "/images/guide/off-court";
const CIT = "/images/guide/the-citadel";

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
    /** 2 foto (bertumpuk) atau 3 foto (2 berdampingan + 1 lebar di bawahnya) — jumlah lain ditolak TypeScript. */
    side: [GuidePhoto, GuidePhoto] | [GuidePhoto, GuidePhoto, GuidePhoto];
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
  /** Figma 2388:2 "Participant Guide — Vale Racquet". */
  {
    venueSlug: "vale-court",
    intro: "Everything you need to know before you step on court — what to wear, what to bring, and what the venue feels like.",
    hero: { src: `${VALE}/hero.webp`, alt: "Soslay members jumping with their rackets on the sage court inside the Vale Racquet hall", position: "50% 50%" },
    theme: { panel: "#4e7a5e", ink: "#4e7a5e" },
    outfit: {
      title: "What should I wear?",
      body: "Warm wood walls and a deep sage court — so go dark or crisp. Black and navy pop against the walls, white shines on the court, and pink adds energy. Skip beige and greens.",
      palette: [
        { name: "Jet Black", role: "Contrast", hex: "#161616" },
        { name: "Optic White", role: "Your base", hex: "#ffffff" },
        { name: "Navy", role: "Classic dark", hex: "#1f2a55" },
        { name: "Hot Pink", role: "Pop", hex: "#f0508c" },
      ],
      avoid: [
        { name: "Beige", hex: "#d2b48c" },
        { name: "Cream", hex: "#efe6d6" },
        { name: "Sage", hex: "#8fae94" },
        { name: "Forest", hex: "#3e6b50" },
      ],
      avoidNote:
        "Beige and cream melt into the warm walls, greens into the court — you'll disappear in photos. Love neutrals? Go crisp white, not cream — beige and tan blend straight into the wood-toned walls.",
      looks: [
        { title: "Modest black set", caption: "Black long top, black pants, white sneakers", photo: { src: `${VALE}/outfit-black.webp`, alt: "Member wearing a modest black long top and black pants" } },
        { title: "Navy + white skirt", caption: "Navy polo, white pleated skirt", photo: { src: `${VALE}/outfit-navy.webp`, alt: "Member wearing a navy polo and white pleated skirt", position: "89% 50%" } },
        { title: "Printed whites", caption: "White printed tee & shorts set", photo: { src: `${VALE}/outfit-printed.webp`, alt: "Member wearing a white printed tee and shorts set" } },
        { title: "Soft whites + pink", caption: "White modest set, pink racket pop", photo: { src: `${VALE}/outfit-pink.webp`, alt: "Member in a white modest set holding a pink racket" } },
      ],
    },
    bring: {
      title: "What should I bring?",
      body: "Bring the essentials — we'll take care of the rest. It's an indoor hall, so no sun to worry about — and there's a calm lounge to cool down in after.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles" },
        { name: "White socks", note: "Keeps the look clean" },
        { name: "Water bottle", note: "Indoor courts still get warm" },
        { name: "Small towel", note: "For between games" },
        { name: "Hair tie / headband", note: "Keeps you cool mid-rally" },
        { name: "Wristband", note: "Keeps sweat off your grip" },
        { name: "Something pink", note: "Your photo pop", optional: true },
        { name: "Spare tee", note: "For hanging out after", optional: true },
      ],
    },
    photoReference: {
      title: ["The mood we're", "shooting for."],
      body: "This isn't a shot list of specific photos — it's the kind of photography and visual mood we go for at Social Slay sessions: real moments, warm soft light, colour against sage.",
      columns: [
        [
          { label: "In action", photo: { src: `${VALE}/ref-in-action.webp`, alt: "A member hitting a backhand under the hall's arched roof", position: "50% 51%" } },
          { label: "The little details", photo: { src: `${VALE}/ref-details.webp`, alt: "Two tennis balls by the net on the sage court", position: "50% 50%" } },
        ],
        [
          { label: "With your people", photo: { src: `${VALE}/ref-people.webp`, alt: "Members high-fiving over the net", position: "50% 51%" } },
          { label: "Portrait", photo: { src: `${VALE}/ref-portrait.webp`, alt: "Member smiling behind a pink racket and a tennis ball", position: "50% 93%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${VALE}/ref-motion.webp`, alt: "Motion-blurred player chasing a ball in front of the wood-toned wall", position: "50% 73%" } },
          { label: "Candid moments", photo: { src: `${VALE}/ref-candid.webp`, alt: "Two members laughing on court in front of the lounge", position: "50% 60%" } },
        ],
      ],
    },
    courtVibe: {
      title: "A glimpse of where you'll be playing.",
      body: "A big indoor hall with warm wood-toned walls, white steel trusses and a deep sage court — plus a calm cream lounge with plants for after the session. Soft, warm light all day.",
      palette: [
        { name: "Wood wall", hex: "#d9a877" },
        { name: "Sage court", hex: "#3f6a50", dark: true },
        { name: "White truss", hex: "#f4f1ea" },
        { name: "Cream lounge", hex: "#eadcc4" },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "warm light, cool lounge ↗",
      feature: { src: `${VALE}/court-main.webp`, alt: "Benches down the middle of the indoor hall between the sage courts", position: "50% 0%" },
      side: [
        { src: `${VALE}/court-side-1.webp`, alt: "Cream lounge with sofas and plants next to the courts" },
        { src: `${VALE}/court-side-2.webp`, alt: "White steel trusses and the wood-toned wall under the roof" },
        { src: `${VALE}/court-wide.webp`, alt: "A player on the sage court in front of the wood-toned wall" },
      ],
      strip: [],
    },
    tips: {
      title: "Before you come.",
      items: [
        { title: "Come photo-ready", body: "Black, white or navy — plus a pink pop. Skip beige and greens." },
        { title: "Rain or shine", body: "It's indoor — the session runs whatever the weather." },
        { title: "Hydrate early", body: "Indoor courts still get warm. Bring a full bottle." },
        { title: "Respect the venue", body: "It's a shared space — keep the lounge tidy and the vibe friendly." },
        { title: "Meet someone new", body: "Come for the tennis, stay for the people. Have fun!" },
      ],
    },
  },
  {
    venueSlug: "the-racquette-temple-airdome",
    intro: "Everything you need to know before you step on court — what to wear, what to bring, and what the venue feels like.",
    hero: { src: `${TEMPLE}/hero.webp`, alt: "Soslay members waving from the blue courts under the white air-dome of The Racquette Temple", position: "50% 56%" },
    theme: { panel: "#3d6f99", ink: "#3d6f99" },
    outfit: {
      title: "What should I wear?",
      body: "White and blush pop against the blue court, and black works as a sharp contrast on the floor — just don't go head-to-toe black next to the black walls. Keep it monochrome with one bright pop.",
      palette: [
        { name: "Optic White", role: "Your base", hex: "#ffffff" },
        { name: "Blush Pink", role: "Pop", hex: "#f2c4ce" },
        { name: "Jet Black", role: "Contrast", hex: "#161616" },
        { name: "Lime", role: "Accent", hex: "#c5eb00" },
      ],
      avoid: [
        { name: "Court Blue", hex: "#6a9ac2" },
        { name: "Navy", hex: "#1b2547" },
        { name: "Teal", hex: "#2e8a8a" },
        { name: "Denim", hex: "#4f6d8f" },
      ],
      avoidNote:
        "Anything blue melts into the court — you'll disappear in photos. Going all-black? Add one light piece — a white visor, socks or shoes. Head-to-toe black blends right into the black walls.",
      looks: [
        { title: "Blush + white", caption: "Blush tee, white pleated skirt, white socks", photo: { src: `${TEMPLE}/outfit-blush.webp`, alt: "Member in a blush tee and white pleated skirt on the blue court" } },
        { title: "Classic whites", caption: "White polo or tee, black shorts", photo: { src: `${TEMPLE}/outfit-classic.webp`, alt: "Member in a white tee and black shorts walking on the blue court", position: "60% 50%" } },
        { title: "Black set + visor", caption: "All-black on the blue floor, white visor & shoes", photo: { src: `${TEMPLE}/outfit-black.webp`, alt: "Member in an all-black set with a white visor and white shoes" } },
        { title: "Mix & match duo", caption: "One in black, one in light contrast as a pair", photo: { src: `${TEMPLE}/outfit-duo.webp`, alt: "Two members posing together, one in black and one in light colours" } },
      ],
    },
    bring: {
      title: "What should I bring?",
      body: "Bring the essentials — we'll take care of the rest. It's an indoor dome court, so no sun or rain to worry about — just bring your game.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles — required indoors" },
        { name: "White socks", note: "Keeps the look clean" },
        { name: "Water bottle", note: "Indoor play still works up a sweat" },
        { name: "Small towel", note: "For between games" },
        { name: "Headband / wristband", note: "Keeps sweat out of your eyes" },
        { name: "Extra overgrip", note: "Hard courts are grippy, your handle should be too" },
        { name: "Light jacket", note: "For hanging out in the lounge after", optional: true },
        { name: "Spare tee", note: "For hanging out after", optional: true },
      ],
    },
    photoReference: {
      title: ["The mood we're", "shooting for."],
      body: "This isn't a shot list of specific photos — it's the kind of photography and visual mood we go for at Social Slay sessions: real moments, soft dome light, colour on blue.",
      columns: [
        [
          { label: "In action", photo: { src: `${TEMPLE}/ref-in-action.webp`, alt: "A member mid-swing on the blue court under the dome", position: "50% 51%" } },
          { label: "The little details", photo: { src: `${TEMPLE}/ref-details.webp`, alt: "A player's pink racket, black wristband and shoes on the blue court", position: "50% 51%" } },
        ],
        [
          { label: "With your people", photo: { src: `${TEMPLE}/ref-people.webp`, alt: "Members together on court", position: "50% 81%" } },
          { label: "Portrait", photo: { src: `${TEMPLE}/ref-portrait.webp`, alt: "Portrait of a member on the blue court", position: "50% 100%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${TEMPLE}/ref-motion.webp`, alt: "Motion-blurred player hitting a forehand under the white dome", position: "50% 91%" } },
          { label: "Candid moments", photo: { src: `${TEMPLE}/ref-candid.webp`, alt: "Members sharing a candid moment by the court", position: "50% 60%" } },
        ],
      ],
    },
    courtVibe: {
      title: "A glimpse of where you'll be playing.",
      body: "An indoor air-dome court: soft white light from the dome, blue hard courts and sleek black walls marked with the Temple crest. Rain or shine, it's always game day.",
      palette: [
        { name: "Court blue", hex: "#6a9ac2", dark: true },
        { name: "Temple black", hex: "#1b1b1d", dark: true },
        { name: "Dome white", hex: "#efefec" },
        { name: "Lounge timber", hex: "#c7a97f" },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "rain or shine, game on ↗",
      feature: { src: `${TEMPLE}/court-main.webp`, alt: "Members on the blue courts inside the white air-dome, black walls with the Temple crest behind them" },
      side: [
        { src: `${TEMPLE}/court-side-1.webp`, alt: "\"The Racquette Temple\" lettering painted on the blue court" },
        { src: `${TEMPLE}/court-side-2.webp`, alt: "The Temple crest on a black wall beside the court" },
        { src: `${TEMPLE}/court-wide.webp`, alt: "View along the net towards the black walls and the Temple crest" },
      ],
      strip: [],
    },
    tips: {
      title: "Before you come.",
      items: [
        { title: "Come photo-ready", body: "Whites, blush or a lime pop. Skip anything blue." },
        { title: "Non-marking only", body: "Indoor hard courts — check your soles before you come." },
        { title: "Hydrate early", body: "Indoor play still works up a sweat. Bring a full bottle." },
        { title: "Respect the venue", body: "It's a shared space — keep the lounge tidy and the vibe friendly." },
        { title: "Meet someone new", body: "Come for the tennis, stay for the people. Have fun!" },
      ],
    },
  },
  {
    venueSlug: "off-court",
    intro: "Everything you need to know before you step on court — what to wear, what to bring, and what the venue feels like.",
    hero: { src: `${OFF}/hero.webp`, alt: "Soslay members jumping with their rackets on the grey court under Off Court's black steel roof", position: "50% 45%" },
    theme: { panel: "#787e81", ink: "#3e4f45" },
    outfit: {
      title: "What should I wear?",
      body: "Grey court, grey walls and a wall of green behind the glass — so go for contrast. White and black look crisp on the concrete, orange is the brightest thing on court, and sky blue keeps it soft. Skip greys.",
      palette: [
        { name: "Optic White", role: "Your base", hex: "#ffffff" },
        { name: "Jet Black", role: "Contrast", hex: "#161616" },
        { name: "Blaze Orange", role: "Pop", hex: "#ff6b1a" },
        { name: "Sky Blue", role: "Soft accent", hex: "#a9cbe6" },
      ],
      avoid: [
        { name: "Slate Grey", hex: "#6e7275" },
        { name: "Concrete", hex: "#a7a9a6" },
        { name: "Charcoal", hex: "#3a3d40" },
        { name: "Olive", hex: "#6b7040" },
      ],
      avoidNote:
        "Greys melt into the court and walls, olive into the trees behind the glass. Love grey? Keep it to one piece — a full grey set disappears into the concrete court and walls.",
      looks: [
        { title: "White tee + black shorts", caption: "White tee, black shorts, cap", photo: { src: `${OFF}/outfit-white.webp`, alt: "Member in a white tee, black shorts and a cap on the grey court" } },
        { title: "Orange pop", caption: "Orange tee, white shorts — brightest on court", photo: { src: `${OFF}/outfit-orange.webp`, alt: "Member in an orange tee and white shorts hitting a volley", position: "60% 50%" } },
        { title: "Sky blue polo", caption: "Sky blue polo, white shorts, white socks", photo: { src: `${OFF}/outfit-sky.webp`, alt: "Member in a sky blue polo and white shorts" } },
        { title: "Modest layers + pink", caption: "Dark long top, pink skirt, leggings", photo: { src: `${OFF}/outfit-modest.webp`, alt: "Member in a dark long top, pink skirt and leggings" } },
      ],
    },
    bring: {
      title: "What should I bring?",
      body: "Bring the essentials — we'll take care of the rest. It's a covered court, so you're shaded — but the sides are open, so it can get warm and humid.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles" },
        { name: "White socks", note: "Keeps the look clean" },
        { name: "Water bottle", note: "It gets humid under the roof" },
        { name: "Small towel", note: "For between games" },
        { name: "Headband / wristband", note: "Keeps sweat out of your eyes" },
        { name: "Bug spray", note: "Lots of greenery around the court" },
        { name: "Small fan", note: "Open-air humidity is real", optional: true },
        { name: "Spare tee", note: "For hanging out after", optional: true },
      ],
    },
    photoReference: {
      title: ["The mood we're", "shooting for."],
      body: "This isn't a shot list of specific photos — it's the kind of photography and visual mood we go for at Social Slay sessions: real moments, soft cool light, colour against grey.",
      columns: [
        [
          { label: "In action", photo: { src: `${OFF}/ref-in-action.webp`, alt: "A member mid-swing on the grey court under the steel roof", position: "50% 51%" } },
          { label: "The little details", photo: { src: `${OFF}/ref-details.webp`, alt: "A tennis ball resting by the white line on the grey court", position: "50% 51%" } },
        ],
        [
          { label: "With your people", photo: { src: `${OFF}/ref-people.webp`, alt: "Members together on court", position: "50% 76%" } },
          { label: "Portrait", photo: { src: `${OFF}/ref-portrait.webp`, alt: "Portrait of a member on the grey court", position: "50% 100%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${OFF}/ref-motion.webp`, alt: "Motion-blurred player hitting a forehand with the trees behind the glass", position: "50% 91%" } },
          { label: "Candid moments", photo: { src: `${OFF}/ref-candid.webp`, alt: "Members sharing a candid moment by the court", position: "50% 60%" } },
        ],
      ],
    },
    courtVibe: {
      title: "A glimpse of where you'll be playing.",
      body: "A covered court with a grey hard surface, concrete walls and a black steel frame — wrapped in frosted glass with jungle-green trees just behind. Soft, cool daylight: shaded, but open-air.",
      palette: [
        { name: "Court grey", hex: "#6e7275", dark: true },
        { name: "Steel black", hex: "#1e1f21", dark: true },
        { name: "Frosted glass", hex: "#e6e9e7" },
        { name: "Greenery", hex: "#4f6b3a", dark: true },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "concrete, glass & jungle ↗",
      feature: { src: `${OFF}/court-main.webp`, alt: "A player on the grey court in front of the frosted glass wall and the trees behind it" },
      side: [
        { src: `${OFF}/court-side-1.webp`, alt: "Black steel roof frame and frosted glass panels above the court" },
        { src: `${OFF}/court-side-2.webp`, alt: "Close-up of the net over the grey hard court" },
        { src: `${OFF}/court-wide.webp`, alt: "View along the net towards the covered seating area", position: "50% 79%" },
      ],
      strip: [],
    },
    tips: {
      title: "Before you come.",
      items: [
        { title: "Come photo-ready", body: "White or black, plus one bright pop. Skip greys." },
        { title: "Shaded, not sealed", body: "Covered court, open sides — it can get warm and humid." },
        { title: "Hydrate early", body: "Humid air works up a sweat. Bring a full bottle." },
        { title: "Respect the venue", body: "It's a shared space — keep the court tidy and the vibe friendly." },
        { title: "Meet someone new", body: "Come for the tennis, stay for the people. Have fun!" },
      ],
    },
  },
  {
    venueSlug: "the-citadel",
    intro: "Everything you need to know before you step on court — what to wear, what to bring, and what the venue feels like.",
    hero: { src: `${CIT}/hero.webp`, alt: "Soslay members jumping with their rackets on the slate-teal court in front of The Citadel's orange walls", position: "50% 70%" },
    theme: { panel: "#e86324", ink: "#c84b1a" },
    outfit: {
      title: "What should I wear?",
      body: "Bold burnt-orange walls and a slate-teal court — the venue already brings the colour. Keep your fit clean: white and cream glow against the orange, black and navy look sharp on the court. Skip orange and rust.",
      palette: [
        { name: "Optic White", role: "Your base", hex: "#ffffff" },
        { name: "Jet Black", role: "Contrast", hex: "#161616" },
        { name: "Teal Blue", role: "Pop", hex: "#63989e" },
        { name: "Butter Cream", role: "Soft glow", hex: "#f3e3b8" },
      ],
      avoid: [
        { name: "Orange", hex: "#e0571e" },
        { name: "Terracotta", hex: "#b8502a" },
        { name: "Peach", hex: "#f2a27a" },
      ],
      avoidNote:
        "Orange and rust melt into the walls — you'll disappear in photos. Love colour? The walls already bring the orange — keep your fit clean and let the venue do the shouting.",
      looks: [
        { title: "White tennis dress", caption: "White sleeveless dress, white sneakers", photo: { src: `${CIT}/outfit-white.webp`, alt: "Member in a white sleeveless tennis dress on the teal court" } },
        { title: "Cream + black skirt", caption: "Butter-cream tank, black skirt, white socks", photo: { src: `${CIT}/outfit-cream.webp`, alt: "Member in a butter-cream tank and black skirt" } },
        { title: "Black & white polo", caption: "Colour-block polo, black shorts", photo: { src: `${CIT}/outfit-polo.webp`, alt: "Member in a black and white colour-block polo and black shorts" } },
        { title: "Teal blue + white", caption: "Blue top with white shorts & white socks", photo: { src: `${CIT}/outfit-teal.webp`, alt: "Member in a teal blue top, white shorts and white socks" } },
      ],
    },
    bring: {
      title: "What should I bring?",
      body: "Bring the essentials — we'll take care of the rest. It's an indoor court, so no sun or rain to worry about — just bring your game.",
      items: [
        { name: "Racket", note: "Bring a spare if you have one" },
        { name: "Tennis shoes", note: "Non-marking soles — required indoors" },
        { name: "White socks", note: "Keeps the look clean" },
        { name: "Water bottle", note: "Indoor play still works up a sweat" },
        { name: "Small towel", note: "For between games" },
        { name: "Headband / wristband", note: "Keeps sweat out of your eyes" },
        { name: "Extra overgrip", note: "Hard courts are grippy, your handle should be too" },
        { name: "Light layer", note: "For hanging out in the lounge after", optional: true },
        { name: "Spare tee", note: "For hanging out after", optional: true },
      ],
    },
    photoReference: {
      title: ["The mood we're", "shooting for."],
      body: "This isn't a shot list of specific photos — it's the kind of photography and visual mood we go for at Social Slay sessions: real moments, bright even light, clean outfits against bold orange.",
      columns: [
        [
          { label: "In action", photo: { src: `${CIT}/ref-in-action.webp`, alt: "A member mid-swing on the teal court in front of the orange wall", position: "50% 51%" } },
          { label: "The little details", photo: { src: `${CIT}/ref-details.webp`, alt: "Close-up detail on the slate-teal court", position: "50% 51%" } },
        ],
        [
          { label: "With your people", photo: { src: `${CIT}/ref-people.webp`, alt: "Members together on court", position: "50% 63%" } },
          { label: "Portrait", photo: { src: `${CIT}/ref-portrait.webp`, alt: "Portrait of a member against the orange wall", position: "50% 100%" } },
        ],
        [
          { label: "Blur in motion", photo: { src: `${CIT}/ref-motion.webp`, alt: "Motion-blurred player hitting a shot on the teal court", position: "50% 91%" } },
          { label: "Candid moments", photo: { src: `${CIT}/ref-candid.webp`, alt: "Members sharing a candid moment by the court", position: "50% 50%" } },
        ],
      ],
    },
    courtVibe: {
      title: "A glimpse of where you'll be playing.",
      body: "An indoor hall with bold burnt-orange walls, slate-teal courts and navy court banners — plus a cosy orange lounge nook at the end. Bright, even light, rain or shine.",
      palette: [
        { name: "Citadel orange", hex: "#e0571e", dark: true },
        { name: "Court teal", hex: "#6e9aa2", dark: true },
        { name: "Banner navy", hex: "#1f2b4d", dark: true },
        { name: "Roof white", hex: "#eeedea" },
        { name: "White lines", hex: "#ffffff" },
      ],
      note: "bold walls, all-weather ↗",
      feature: { src: `${CIT}/court-main.webp`, alt: "The slate-teal court and burnt-orange walls of The Citadel's indoor hall" },
      side: [
        { src: `${CIT}/court-side-1.webp`, alt: "Navy court banner against the orange wall" },
        { src: `${CIT}/court-side-2.webp`, alt: "Net over the slate-teal hard court" },
        { src: `${CIT}/court-wide.webp`, alt: "Wide view of the indoor hall towards the orange lounge nook", position: "50% 71%" },
      ],
      strip: [],
    },
    tips: {
      title: "Before you come.",
      items: [
        { title: "Come photo-ready", body: "White, black, navy, cream or teal. Skip orange." },
        { title: "Non-marking only", body: "Indoor hard courts — check your soles before you come." },
        { title: "Hydrate early", body: "Indoor play still works up a sweat. Bring a full bottle." },
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
