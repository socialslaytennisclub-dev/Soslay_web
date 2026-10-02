import type { IconName } from "@/components/ui";
import { activityTypes } from "./activity";

/** Konten global (navbar & footer). Nanti diganti data dari CMS. */

export type NavLink = { label: string; href: string };

export const primaryNav: {
  activity: { label: string; href: string; children: NavLink[] };
  links: NavLink[];
} = {
  activity: {
    label: "Activity",
    href: "/activity",
    children: activityTypes.map((type) => ({ label: type.label, href: `/activity?type=${type.slug}` })),
  },
  links: [
    { label: "Venue", href: "/venue" },
    { label: "Shop", href: "/shop" },
  ],
};

export const authLinks = {
  login: { label: "Masuk", href: "/masuk" },
  cart: { label: "Tas belanja", href: "/akun/order" },
};

export const contact = {
  tagline: "We curate the best courts, the best people, and the best moments then hand you a professional photo",
  phone: { label: "Telepon", value: "+62 642424792", href: "tel:+62642424792" },
  email: { label: "Email", value: "support@soslay.com", href: "mailto:support@soslay.com" },
};

export const footerColumns: { title: string; links: NavLink[] }[] = [
  {
    title: "Halaman lain",
    links: [
      { label: "Aktifitas", href: "/activity" },
      { label: "Tempat", href: "/venue" },
      { label: "Belanja", href: "/shop" },
      { label: "Komunitas", href: "/komunitas" },
      { label: "Acara", href: "/acara" },
    ],
  },
  {
    title: "Bantuan",
    links: [
      { label: "Kontak", href: "/kontak" },
      { label: "Info", href: "/info" },
      { label: "Kolaborasi", href: "/kolaborasi" },
    ],
  },
];

export const socialLinks: { label: string; href: string; icon: IconName }[] = [
  { label: "Instagram", href: "https://instagram.com/socialslay", icon: "instagram-logo-fill" },
  { label: "Threads", href: "https://threads.net/@socialslay", icon: "threads-logo-fill" },
  { label: "WhatsApp", href: "https://wa.me/62642424792", icon: "whatsapp-logo-fill" },
];

export const copyright = "Copyright 2026 Social Slay Tennis Club - All rights reserved";
