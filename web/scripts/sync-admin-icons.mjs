/**
 * Salin ikon admin dari paket resmi Phosphor (sumber ikon di Figma "_ikon admin", 25:3057)
 * ke public/icons/admin. Nama file = nama ikon Figma tanpa prefix "ph/".
 *
 *   node scripts/sync-admin-icons.mjs
 */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "node_modules/@phosphor-icons/core/assets");
const OUT = path.join(ROOT, "public/icons/admin");

/** Daftar dari frame Figma 25:3057 — "-bold" = weight bold, sisanya regular. */
const ICONS = [
  "squares-four", "users-three", "user", "calendar-dots", "map-pin", "t-shirt", "receipt", "layout", "images",
  "gear-six", "magnifying-glass", "bell-simple", "funnel-simple", "download-simple", "caret-down", "caret-right",
  "caret-left", "pencil-simple", "eye", "upload-simple", "dots-six-vertical", "trend-up", "trend-down", "clock",
  "whatsapp-logo", "instagram-logo", "envelope-simple", "phone", "image", "tag", "sign-out", "star", "x", "coins",
  "shopping-bag-open", "tennis-ball", "qr-code", "copy", "trash", "arrows-down-up", "crown-simple", "package",
  "truck", "link-simple", "globe-simple", "question", "arrow-up-right", "check-circle", "warning-circle",
  "note-pencil", "user-plus", "calendar-plus", "sliders-horizontal", "text-t", "list-bullets", "map-trifold",
  "storefront", "chat-circle-text", "shield-check", "key", "plus-bold", "check-bold", "dots-three-bold",
  "dots-three-vertical-bold",
];

await mkdir(OUT, { recursive: true });
for (const name of ICONS) {
  const bold = name.endsWith("-bold");
  const base = bold ? name.slice(0, -5) : name;
  const src = path.join(SRC, bold ? "bold" : "regular", `${base}${bold ? "-bold" : ""}.svg`);
  await copyFile(src, path.join(OUT, `${name}.svg`));
}
console.log(`${ICONS.length} ikon → public/icons/admin`);
