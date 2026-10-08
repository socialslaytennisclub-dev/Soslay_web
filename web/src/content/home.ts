import type { IconName } from "@/components/ui";
import { featuredProducts, productCardProps } from "./products";
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
    "Bukan sekadar komunitas bermain tenis.",
    "Tapi sebuah komunitas untuk bermain, terhubung, dan menikmati momen bersama orang-orang yang tepat",
  ],
  cta: { label: "Gabung Komunitas", href: "/daftar" },
  image: { src: `${IMG}/hero.webp`, alt: "Member Soslay melompat bersama di lapangan tenis" },
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
  title: "Lebih dari Sekadar Pertandingan!",
  description:
    "Dari mabar santai sampai match day, selalu ada cara untuk ikut bermain, bertemu orang baru, dan menikmati serunya tenis bersama komunitas.",
  cta: { label: "Booking Session di Kuyy", href: KUY_BOOKING_URL },
  ctaCaption: "Good courts. Good people. Good times.",
  items: [
    {
      title: "Weekly MABAR Sessions",
      image: `${IMG}/activity-weekly-mabar.webp`,
      imagePosition: "50% 72%",
      overlay: "25",
      href: "/activity?type=weekly-mabar",
      size: "wide",
    },
    {
      title: "Tennis Match Day",
      image: `${IMG}/activity-match-day.webp`,
      imagePosition: "50% 0%",
      overlay: "25",
      href: "/activity?type=match-day",
      size: "narrow",
    },
    {
      title: "Tennis Escape",
      image: `${IMG}/activity-tennis-escape.webp`,
      imagePosition: "50% 50%",
      overlay: "45",
      href: "/activity?type=tennis-escape",
      size: "narrow",
    },
    {
      title: "Beginner Coaching",
      description:
        "Baru mulai tenis? Nggak masalah. Pelajari dasar-dasarnya, bangun confidence, dan mulai main bersama komunitas.",
      image: `${IMG}/activity-beginner-coaching.webp`,
      imagePosition: "50% 85%",
      overlay: "50",
      href: "/activity?type=beginner-coaching",
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
  title: "Kami Hanya Bermain di Tempat yang Terlihat Bagus.",
  description:
    "Kami memilih venue dengan suasana, fasilitas, dan pengalaman yang layak untuk dinikmati. Dari Jakarta sampai Bali, temukan tempat bermain yang bikin setiap sesi terasa lebih spesial.",
  locations: [
    { city: "Jakarta,", text: "pilihan kami di berbagai sudut Jakarta." },
    { city: "Bali,", text: "bermain dengan suasana yang sedikit lebih santai." },
  ],
  cta: { label: "See all Court", href: "/venue" },
  /** Urutan = kolom kiri dulu (3), lalu kolom kanan (3), seperti di Figma. */
  items: venueList,
};

export type Testimonial = {
  quote: string;
  name: string;
  avatar?: string;
};

export const community = {
  title: ["The People Make", "the Game."],
  description:
    "Temukan komunitas yang membuat setiap permainan terasa lebih berarti. Kenalan, bermain, berbagi momen, dan tumbuh bersama orang-orang yang tepat.",
  cta: { label: "Gabung ke Komunitas", href: "/daftar" },
  photos: {
    group: { src: `${IMG}/community-group.webp`, alt: "Member Soslay berfoto bersama di lapangan", position: "45% 40%" },
    court: { src: `${IMG}/activity-weekly-mabar.webp`, alt: "Sesi mabar di lapangan outdoor", position: "48% 50%" },
    highfive: { src: `${IMG}/community-highfive.webp`, alt: "Member saling tos setelah rally", position: "70% 60%" },
  },
  testimonials: [
    { quote: "Niatnya cuma satu sesi. Eh, malah jadi rutin ketemu dan main bareng.", name: "Anitya Ayu Silfia07", avatar: `${IMG}/avatar-anitya.webp` },
    { quote: "Datang untuk main, tapi selalu ada alasan untuk celebrate bareng.", name: "@vikayusti" },
    { quote: "Yang aku suka dari Soslay, semuanya terasa effortless. Datang, main, ketemu orang baru, dan have a good time.", name: "@yudisadewa" },
    { quote: "Yang bikin ketagihan bukan cuma permainannya, tapi orang-orang yang kamu temui di sepanjang jalan.", name: "@sintakusuma" },
    { quote: "Main bareng, ketawa bareng, repeat lagi minggu depan.", name: "@lily117" },
  ] satisfies Testimonial[],
};

export const marquee = {
  text: "PLAY. CONNECT. REPEAT.",
};

export const shop = {
  title: "Beyond the Court.",
  description:
    "Koleksi yang terinspirasi dari permainan, perjalanan, dan orang-orang yang membuat setiap momen di SOSLAY terasa spesial.",
  cta: { label: "Lihat Koleksi", href: "/shop" },
  products: featuredProducts().map(productCardProps),
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
  description: "Lihat keseruan SOSLAY dari dekat. Dari rally seru sampai momen di luar lapangan, semuanya ada di sini.",
  cta: { label: "Follow our Instagram", href: "https://instagram.com/socialslay" },
  posts: [
    { platform: "instagram", text: ["Main tenis jadi jauh lebih seru ketika kamu bisa menikmati setiap rally dan setiap momennya."], handle: "@andrea42", image: `${IMG}/ig-andrea.webp`, imagePosition: "30% 40%", href: "https://instagram.com/socialslay" },
    { platform: "instagram", text: ["“Datang untuk main, tapi selalu ada alasan untuk celebrate bareng.”"], handle: "@vikayusti", image: `${IMG}/ig-vika.webp`, imagePosition: "50% 15%", href: "https://instagram.com/socialslay" },
    {
      platform: "threads",
      text: [
        "Yang aku suka dari @socialslay, semuanya terasa effortless. Datang, main, ketemu orang baru, dan have a good time.",
        "Setiap sesi selalu terasa berbeda. Kadang datang buat main, kadang pulang dengan teman baru.",
      ],
      handle: "@yudisadewa",
      href: "https://threads.net/@socialslay",
    },
    { platform: "instagram", text: ["Yang bikin ketagihan bukan cuma permainannya, tapi orang-orang yang kamu temui di sepanjang jalan."], handle: "@sintakusuma", image: `${IMG}/ig-sinta.webp`, imagePosition: "50% 25%", href: "https://instagram.com/socialslay" },
    { platform: "instagram", text: ["Main bareng, ketawa bareng, repeat lagi minggu depan."], handle: "@lily117", image: `${IMG}/ig-lily.webp`, imagePosition: "50% 70%", href: "https://instagram.com/socialslay" },
  ] satisfies SocialPost[],
};
