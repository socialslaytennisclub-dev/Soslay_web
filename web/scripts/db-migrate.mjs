/**
 * Jalankan migration baru (yang belum pernah dipasang) ke database Supabase.
 *
 *   npm run db:migrate
 *
 * Yang sudah terpasang dicatat di tabel public.schema_migrations. Butuh DATABASE_URL di
 * .env.local (sama dengan db:setup).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

process.loadEnvFile?.(path.resolve(import.meta.dirname, "../.env.local"));
if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL belum diisi di web/.env.local (lihat .env.example).");
  process.exit(1);
}

// Migration yang sudah dipasang oleh db:setup sebelum pencatatan ini ada.
const BASELINE = ["20261007000000_init.sql", "20261008000000_my_admin_access.sql"];

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, prepare: false });

try {
  const [{ hasTable }] = await sql`select to_regclass('public.schema_migrations') is not null as "hasTable"`;
  if (!hasTable) {
    const [{ hasSchema }] = await sql`select to_regclass('public.profiles') is not null as "hasSchema"`;
    await sql`create table schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table schema_migrations enable row level security`; // tidak terbuka lewat API
    if (hasSchema) for (const name of BASELINE) await sql`insert into schema_migrations (name) values (${name})`;
  }

  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const pending = (await readdir(dir)).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
  if (!pending.length) console.log("✓ Database sudah terbaru.");

  for (const file of pending) {
    await sql.begin(async (tx) => {
      await tx.unsafe(await readFile(path.join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`✓ migration ${file}`);
  }
} catch (error) {
  console.error("✗ Gagal:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
