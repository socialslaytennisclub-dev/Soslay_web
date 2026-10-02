import type { TextVariant } from "@/components/ui";

/** Data untuk halaman /design-system (styleguide). Nilai = token di src/styles/tokens.css. */

export const colorGroups: { name: string; tokens: { token: string; hex: string }[] }[] = [
  {
    name: "Navy",
    tokens: [
      { token: "navy-950", hex: "#060628" },
      { token: "navy-900", hex: "#0A084A" },
      { token: "navy-850", hex: "#0D0D5D" },
      { token: "navy-800", hex: "#100E54" },
      { token: "navy-700", hex: "#1E1E6A" },
    ],
  },
  {
    name: "Indigo",
    tokens: [
      { token: "indigo-700", hex: "#221B9D" },
      { token: "indigo-600", hex: "#291FC0" },
      { token: "indigo-500", hex: "#4035DE" },
      { token: "indigo-muted", hex: "#3A3582" },
      { token: "indigo-200", hex: "#D6D9FF" },
      { token: "indigo-150", hex: "#E5E8FF" },
      { token: "indigo-100", hex: "#EBECFF" },
      { token: "indigo-border", hex: "#EAECFF" },
      { token: "indigo-50", hex: "#F4F5FF" },
    ],
  },
  {
    name: "Lime",
    tokens: [
      { token: "lime-neon", hex: "#D7FF00" },
      { token: "lime-400", hex: "#CAF100" },
      { token: "lime-500", hex: "#D4EF1F" },
      { token: "lime-600", hex: "#C0E500" },
      { token: "lime-700", hex: "#A4C400" },
      { token: "lime-800", hex: "#8EA800" },
      { token: "lime-100", hex: "#F4FFB8" },
      { token: "lime-50", hex: "#FAFFE3" },
    ],
  },
  {
    name: "Pink & Neutral",
    tokens: [
      { token: "pink-500", hex: "#EC6ABC" },
      { token: "pink-400", hex: "#EF83C7" },
      { token: "pink-100", hex: "#FCE7F4" },
      { token: "neutral-900", hex: "#252525" },
      { token: "neutral-600", hex: "#7B7B7B" },
      { token: "neutral-300", hex: "#D9D9D9" },
      { token: "neutral-100", hex: "#F3F3F3" },
      { token: "white", hex: "#FFFFFF" },
    ],
  },
];

export const gradients = [
  { token: "gradient-lime", note: "CTA, footer, marquee" },
  { token: "gradient-lime-neon", note: "Wordmark hero, badge tas" },
  { token: "gradient-navy", note: "Section gelap, kartu Threads" },
  { token: "gradient-indigo", note: "Aksen indigo" },
];

export const typeScale: { variant: TextVariant; figma: string; sample: string }[] = [
  { variant: "wordmark", figma: "Chillax Bold 320", sample: "SOSLAY" },
  { variant: "heading-52", figma: "Heading/52 Poppins ExtraBold", sample: "Kami Hanya Bermain di Tempat Bagus." },
  { variant: "heading-48", figma: "Heading/48 Poppins ExtraBold", sample: "PLAY. CONNECT. REPEAT." },
  { variant: "heading-42", figma: "Heading/42 Poppins ExtraBold", sample: "Lebih dari Sekadar Pertandingan!" },
  { variant: "title-28", figma: "Title/28 Poppins ExtraBold", sample: "Weekly MABAR Sessions" },
  { variant: "title-24", figma: "Title/24 Poppins Bold", sample: "A Piece of Bali" },
  { variant: "subtitle-20", figma: "Subtitle/20 Poppins ExtraBold", sample: "Halaman lain" },
  { variant: "subtitle-20-semibold", figma: "Subtitle/20 Poppins SemiBold", sample: "Aktifitas" },
  { variant: "body-18", figma: "Body/18 Helvetica", sample: "Bukan sekadar komunitas bermain tenis." },
  { variant: "body-18-ui", figma: "Body/18 Inter Semi Bold", sample: "Jakarta · Indoor" },
  { variant: "body-16", figma: "Body/16 Helvetica", sample: "Dari mabar santai sampai match day, selalu ada cara untuk ikut bermain." },
  { variant: "body-16-bold", figma: "Body/16 Helvetica Bold", sample: "Active Members" },
  { variant: "body-14", figma: "Caption/14 Helvetica", sample: "Good courts. Good people. Good times." },
  { variant: "body-14-bold", figma: "Caption/14 Helvetica Bold", sample: "@andrea42" },
];

export const spacing = [4, 8, 12, 16, 20, 24, 32, 48, 64, 80, 128];

export const radii = [
  { token: "radius-sm", value: 4 },
  { token: "radius-md", value: 8 },
  { token: "radius-lg", value: 12 },
  { token: "radius-xl", value: 16 },
  { token: "radius-full", value: 999 },
];
