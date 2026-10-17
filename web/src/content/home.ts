import type { IconName } from "@/components/ui";
import { featuredProducts, productCardProps, productDetails } from "./products";
import { venueList } from "./venues";

/**
 * Konten homepage (copy, gambar, link) — terpisah dari markup.
 * Strukturnya mengikuti section di Figma "Hero" (node 25:125) supaya
 * nanti mudah diganti dengan data dari CMS (lihat PRD §4.1).
 */

const IMG = "/images/home";
const KUY_BOOKING_URL = "https://kuy.id/soslay";

export const hero = {
  title: "SOSLAY",
  description: [
    "Not just a tennis community.",
    "A community to play, connect, and enjoy moments with the right people.",
  ],
  cta: { label: "Join the Community", href: "/daftar" },
  image: { src: `${IMG}/hero.webp`, alt: "Soslay members jumping together on a tennis court" },
};

export type ActivityHighlight = {
  title: string;
  description?: string;
  image: string;
  imagePosition: string;
  overlay: "25" | "45" | "50";
  href: string;
  /** Kartu lebar (535px) atau sempit (313px) pada grid desktop. */
  size: "wide" | "narrow";
};

export const activities = {
  title: "More Than Just a Match!",
  description:
    "From casual hit-arounds to match day, there's always a way to play, meet new people, and enjoy tennis with the community.",
  cta: { label: "Book a Session on Kuyy", href: KUY_BOOKING_URL },
  ctaCaption: "Good courts. Good people. Good times.",
  items: [
    {
      title: "MABAR Sessions",
      description: "Casual weekly hit-arounds at our favorite courts — meet new people, rally, and go home with pro photos.",
      image: `${IMG}/activity-weekly-mabar.webp`,
      imagePosition: "50% 72%",
      overlay: "25",
      href: "/activity/mabar",
      size: "wide",
    },
    {
      title: "Tennis Event",
      description: "Match days, socials, and special sessions the community looks forward to all month.",
      image: `${IMG}/activity-match-day.webp`,
      imagePosition: "50% 0%",
      overlay: "25",
      href: "/activity/event",
      size: "narrow",
    },
    {
      title: "Tennis Escape",
      description: "Tennis trips to beautiful courts — from Bali villages to the mountains of Kintamani.",
      image: `${IMG}/activity-tennis-escape.webp`,
      imagePosition: "50% 50%",
      overlay: "45",
      href: "/activity/escape",
      size: "narrow",
    },
    {
      title: "Beginner Coaching",
      description:
        "New to tennis? No problem. Learn the basics, build your confidence, and start playing with the community.",
      image: `${IMG}/activity-beginner-coaching.webp`,
      imagePosition: "50% 85%",
      overlay: "50",
      href: "/activity/coaching",
      size: "wide",
    },
  ] satisfies ActivityHighlight[],
};

export const stats: { value: string; label: string; icon: IconName }[] = [
  { value: "500+", label: "Active Members", icon: "users-three-bold" },
  { value: "60+", label: "Events Hosted", icon: "tennis-ball-bold" },
  { value: "5+", label: "Sessions per Week", icon: "calendar-dots-bold" },
  { value: "100%", label: "Pro Photography", icon: "aperture-bold" },
];

export const venues = {
  title: "We Only Play Where It Looks Good.",
  description:
    "We choose venues with the atmosphere, facilities, and experience worth enjoying. From Jakarta to Bali, find courts that make every session feel a little more special.",
  locations: [
    { city: "Jakarta,", text: "our picks across every corner of Jakarta." },
    { city: "Bali,", text: "play with a slightly more laid-back vibe." },
  ],
  cta: { label: "See All Courts", href: "/venue" },
  /** Urutan = kolom kiri dulu (3), lalu kolom kanan (3), seperti di Figma. */
  items: venueList,
};

export type Testimonial = {
  quote: string;
  name: string;
  avatar?: string;
  /** Testimoni video pendek 9:16 (Reels / TikTok / Shorts) — tautan dibuka di platformnya. */
  video?: { url: string; platform: string };
};

export const community = {
  title: ["The People Make", "the Game."],
  description:
    "Find a community that makes every game more meaningful. Meet new people, play, share moments, and grow together with the right crowd.",
  cta: { label: "Join the Community", href: "/daftar" },
  photos: {
    group: { src: `${IMG}/community-group.webp`, alt: "Soslay members posing together on court", position: "45% 40%" },
    court: { src: `${IMG}/activity-weekly-mabar.webp`, alt: "A mabar session on an outdoor court", position: "48% 50%" },
    highfive: { src: `${IMG}/community-highfive.webp`, alt: "Members high-fiving after a rally", position: "70% 60%" },
  },
  testimonials: [
    { quote: "I only meant to come for one session. Somehow it turned into a regular thing.", name: "Anitya Ayu Silfia07", avatar: `${IMG}/avatar-anitya.webp` },
    { quote: "Come to play, but there's always a reason to celebrate together.", name: "@vikayusti" },
    { quote: "What I love about Soslay is that everything feels effortless. Show up, play, meet new people, and have a good time.", name: "@yudisadewa" },
    { quote: "What keeps you hooked isn't just the game, it's the people you meet along the way.", name: "@sintakusuma" },
    { quote: "Play together, laugh together, repeat next week.", name: "@lily117" },
  ] satisfies Testimonial[],
};

export const marquee = {
  text: "PLAY CONNECT REPEAT",
};

/** Splash homepage: kata yang "ditulis" bola + motto di bawahnya (dari teks marquee). */
export const splash = {
  word: "SOSLAY",
  motto: marquee.text.split(" ").join(" · "),
};

export const shop = {
  title: "Beyond the Court.",
  description:
    "A collection inspired by the game, the journey, and the people who make every moment at SOSLAY feel special.",
  cta: { label: "View Collection", href: "/shop" },
  products: featuredProducts().map((product) => productCardProps(product, productDetails[product.slug])),
};

export type SocialPost = {
  platform: "instagram" | "threads";
  text: string[];
  handle: string;
  image?: string;
  imagePosition?: string;
  href: string;
};

export const instagram = {
  title: "See You on the Court!",
  description: "Get a closer look at SOSLAY. From epic rallies to moments off the court, it's all here.",
  cta: { label: "Follow our Instagram", href: "https://instagram.com/socialslay" },
  posts: [
    { platform: "instagram", text: ["Tennis gets so much more fun when you can enjoy every rally and every moment."], handle: "@andrea42", image: `${IMG}/ig-andrea.webp`, imagePosition: "30% 40%", href: "https://instagram.com/socialslay" },
    { platform: "instagram", text: ["“Come to play, but there's always a reason to celebrate together.”"], handle: "@vikayusti", image: `${IMG}/ig-vika.webp`, imagePosition: "50% 15%", href: "https://instagram.com/socialslay" },
    {
      platform: "threads",
      text: [
        "What I love about @socialslay is that everything feels effortless. Show up, play, meet new people, and have a good time.",
        "Every session feels different. Sometimes you come to play, sometimes you go home with a new friend.",
      ],
      handle: "@yudisadewa",
      href: "https://threads.net/@socialslay",
    },
    { platform: "instagram", text: ["What keeps you hooked isn't just the game, it's the people you meet along the way."], handle: "@sintakusuma", image: `${IMG}/ig-sinta.webp`, imagePosition: "50% 25%", href: "https://instagram.com/socialslay" },
    { platform: "instagram", text: ["Play together, laugh together, repeat next week."], handle: "@lily117", image: `${IMG}/ig-lily.webp`, imagePosition: "50% 70%", href: "https://instagram.com/socialslay" },
  ] satisfies SocialPost[],
};
