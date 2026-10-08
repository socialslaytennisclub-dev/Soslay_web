/**
 * Pasang skema + data contoh ke database Supabase (sekali, di project baru).
 *
 *   npm run db:setup            → migrations + seed.sql
 *   npm run db:setup -- --no-seed  → migrations saja (tanpa data contoh)
 *
 * Butuh DATABASE_URL di .env.local (Supabase → Project Settings → Database → Connection
 * string, mode Session pooler). Script menolak jalan kalau tabel Soslay sudah ada.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

process.loadEnvFile?.(path.resolve(import.meta.dirname, "../.env.local"));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL belum diisi di web/.env.local (lihat .env.example).");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "../supabase");
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });

try {
  const [{ exists }] = await sql`select to_regclass('public.profiles') is not null as exists`;
  if (exists) {
    console.error("✗ Tabel Soslay sudah ada di database ini — setup dibatalkan supaya data tidak dobel.");
    process.exit(1);
  }

  for (const file of (await readdir(path.join(root, "migrations"))).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(await readFile(path.join(root, "migrations", file), "utf8"));
    console.log(`✓ migration ${file}`);
  }

  if (!process.argv.includes("--no-seed")) {
    await sql.unsafe(await readFile(path.join(root, "seed.sql"), "utf8"));
    const [c] = await sql`select (select count(*) from profiles)::int as members, (select count(*) from sessions)::int as sessions, (select count(*) from orders)::int as orders`;
    console.log(`✓ seed: ${c.members} member, ${c.sessions} sesi, ${c.orders} order (data contoh)`);
  }
  console.log("Selesai. Langkah berikutnya: jadikan akunmu Super Admin (lihat docs/04-DATABASE.md).");
} catch (error) {
  console.error("✗ Gagal:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
