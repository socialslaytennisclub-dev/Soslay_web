/**
 * Jalankan migration baru (yang belum pernah dipasang) ke database Supabase.
 *
 *   npm run db:migrate
 *
 * Yang sudah terpasang dicatat di tabel public.schema_migrations. Butuh DATABASE_URL di
 * .env.local (sama dengan db:setup).
 */
import { createHash } from "node:crypto";
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

  // Checksum isi file: migrasi yang sudah terpasang lalu diubah tidak akan dijalankan ulang —
  // laporkan & gagalkan run supaya perubahannya dibuat sebagai migrasi baru.
  await sql`alter table schema_migrations add column if not exists checksum text`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  // Dinormalisasi (CRLF → LF, spasi di akhir baris) supaya checkout Windows / editor tidak memicu peringatan palsu.
  const normalize = (text) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
  const sums = new Map(await Promise.all(files.map(async (f) => [f, createHash("sha256").update(normalize(await readFile(path.join(dir, f), "utf8"))).digest("hex")])));
  const appliedRows = await sql`select name, checksum from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.name));
  const changed = [];
  let backfilled = 0;
  for (const { name, checksum } of appliedRows) {
    if (!sums.has(name)) continue;
    if (checksum === null) {
      await sql`update schema_migrations set checksum = ${sums.get(name)} where name = ${name}`;
      backfilled++;
    } else if (checksum !== sums.get(name)) changed.push(name);
  }
  // Checksum pertama diambil dari isi file sekarang — versi lama yang dulu dijalankan tidak diketahui.
  if (backfilled) console.log(`ℹ ${backfilled} migrasi lama dicatat checksum-nya dari isi file sekarang (perubahan sebelum hari ini tidak terdeteksi).`);
  const pending = files.filter((f) => !applied.has(f));
  if (!pending.length) console.log("✓ Database sudah terbaru.");

  for (const file of pending) {
    await sql.begin(async (tx) => {
      await tx.unsafe(await readFile(path.join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name, checksum) values (${file}, ${sums.get(file)})`;
    });
    console.log(`✓ migration ${file}`);
  }
  // Migrasi terpasang yang isinya diubah: perubahannya tidak pernah dijalankan → gagalkan supaya terlihat.
  for (const name of changed) console.error(`✗ ${name} sudah terpasang tapi isinya berubah — perubahan itu TIDAK dijalankan; buat migrasi baru.`);
  if (changed.length) process.exitCode = 1;
} catch (error) {
  console.error("✗ Gagal:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
