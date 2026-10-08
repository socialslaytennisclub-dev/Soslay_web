/**
 * Konversi semua JPG/PNG di public/images → WebP + buat blur placeholder.
 *
 *   node scripts/optimize-images.mjs
 *
 * - Foto: WebP q82, sisi terpanjang maks 2400px (hero 2880px) — cukup tajam untuk layar retina,
 *   next/image yang memotong ke ukuran per device.
 * - PNG transparan (logo): WebP q92 dengan alpha.
 * - File asli dihapus setelah berhasil dikonversi.
 * - Blur placeholder (WebP 16px, base64) disimpan ke src/lib/image-placeholders.json
 *   dan dipakai lewat `blurProps(src)` (src/lib/image.ts).
 */
import { readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const IMAGES = path.join(PUBLIC, "images");
const MANIFEST = path.join(ROOT, "src/lib/image-placeholders.json");

/** Sisi terpanjang khusus (default 2400px): hero full-bleed & latar login yang di-zoom di desktop. */
const MAX_SIDE = { "home/hero.jpg": 2880, "auth/auth-bg.jpg": 3600 };

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])),
  );
  return files.flat();
}

const files = await walk(IMAGES);
const manifest = {};
let before = 0;
let after = 0;

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const rel = path.relative(IMAGES, file);
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;

  const out = file.replace(/\.(jpe?g|png|webp)$/i, ".webp");
  const publicPath = `/${path.relative(PUBLIC, out).split(path.sep).join("/")}`;

  if (ext !== ".webp") {
    const maxSide = MAX_SIDE[rel] ?? 2400;
    const isPng = ext === ".png";
    before += (await stat(file)).size;
    await sharp(file)
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .webp(isPng ? { quality: 92, alphaQuality: 100, effort: 6 } : { quality: 82, effort: 6, smartSubsample: true })
      .toFile(out);
    after += (await stat(out)).size;
    await rm(file);
  }

  // Logo kecil tidak butuh blur placeholder.
  if (rel.startsWith("brand/")) continue;
  const tiny = await sharp(out).resize(16, 16, { fit: "inside" }).webp({ quality: 50 }).toBuffer();
  manifest[publicPath] = `data:image/webp;base64,${tiny.toString("base64")}`;
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
console.log(`Dikonversi: ${kb(before)} → ${kb(after)} · placeholder: ${Object.keys(sorted).length}`);
