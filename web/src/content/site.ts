import type { IconName } from "@/components/ui";
import { activityTypeHref, activityTypes } from "./activity";
import { guidePrompt } from "./guides";

/** Konten global (navbar & footer) — Figma Website v2 (423:2482). */

export type NavLink = { label: string; href: string };

export const primaryNav: {
  activity: { label: string; href: string; children: NavLink[] };
  links: NavLink[];
} = {
  activity: {
    label: "Activity",
    href: "/activity",
    children: activityTypes.map((type) => ({ label: type.label, href: activityTypeHref(type.slug) })),
  },
  links: [
    { label: "Venue", href: "/venue" },
    { label: "Shop", href: "/shop" },
  ],
};

export const authLinks = {
  login: { label: "Sign In", href: "/masuk" },
  cart: { label: "Shopping bag", href: "/akun/order" },
};

export const contact = {
  tagline: "We curate the best courts, the best people, and the best moments then hand you a professional photo",
  phone: { label: "Phone", value: "+62 642424792", href: "tel:+62642424792" },
  email: { label: "Email", value: "support@soslay.com", href: "mailto:support@soslay.com" },
};

export const footerColumns: { title: string; links: NavLink[] }[] = [
  {
    title: "Other Pages",
    links: [
      { label: "Activities", href: "/activity" },
      { label: "Venues", href: "/venue" },
      { label: "Shop", href: "/shop" },
      { label: "Community", href: "/komunitas" },
      { label: "Events", href: "/acara" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Participant Guide", href: guidePrompt.href },
      { label: "Contact", href: "/kontak" },
      { label: "Info", href: "/info" },
      { label: "Collaboration", href: "/kolaborasi" },
    ],
  },
];

export const socialLinks: { label: string; href: string; icon: IconName }[] = [
  { label: "Instagram", href: "https://instagram.com/socialslay", icon: "instagram-logo-fill" },
  { label: "Threads", href: "https://threads.net/@socialslay", icon: "threads-logo-fill" },
  { label: "WhatsApp", href: "https://wa.me/62642424792", icon: "whatsapp-logo-fill" },
];

export const copyright = "Copyright 2026 Social Slay Tennis Club - All rights reserved";
