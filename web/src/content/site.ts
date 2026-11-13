import type { IconName } from "@/components/ui";
import { activityTypeHref, activityTypes } from "./activity";
import { guidePrompt } from "./guides";
import { CONTACT_EMAIL, INSTAGRAM_URL, THREADS_URL, WHATSAPP_DISPLAY, whatsappUrl } from "./social";

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
  phone: { label: "WhatsApp", value: WHATSAPP_DISPLAY, href: whatsappUrl() },
  email: { label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
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
  { label: "Instagram", href: INSTAGRAM_URL, icon: "instagram-logo-fill" },
  { label: "Threads", href: THREADS_URL, icon: "threads-logo-fill" },
  { label: "WhatsApp", href: whatsappUrl(), icon: "whatsapp-logo-fill" },
];

export const copyright = "Copyright 2026 Social Slay Tennis Club - All rights reserved";
