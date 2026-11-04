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
    await sql`create table schema_migrations (name text primary key, applied_at timestamptz not null default now(), checksum text)`;
    await sql`alter table schema_migrations enable row level security`; // tidak terbuka lewat API
    if (hasSchema) for (const name of BASELINE) await sql`insert into schema_migrations (name) values (${name})`;
  }

  // Checksum isi file: migrasi yang sudah terpasang lalu diubah tidak akan dijalankan ulang —
  // laporkan & gagalkan run supaya perubahannya dibuat sebagai migrasi baru.
  const [{ hasChecksum }] = await sql`select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'schema_migrations' and column_name = 'checksum') as "hasChecksum"`;
  if (!hasChecksum) await sql`alter table schema_migrations add column checksum text`;
  // Dinormalisasi (CRLF → LF, spasi di akhir baris) supaya checkout Windows / editor tidak memicu peringatan palsu.
  const normalize = (text) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const migrations = new Map(
    await Promise.all(
      files.map(async (f) => {
        const text = await readFile(path.join(dir, f), "utf8");
        return [f, { text, sum: createHash("sha256").update(normalize(text)).digest("hex") }];
      }),
    ),
  );
  const recorded = new Map((await sql`select name, checksum from schema_migrations`).map((r) => [r.name, r.checksum]));

  // Checksum pertama diambil dari isi file sekarang — versi lama yang dulu dijalankan tidak diketahui.
  const missing = files.filter((f) => recorded.has(f) && recorded.get(f) === null);
  if (missing.length) {
    await sql`update schema_migrations m set checksum = v.sum from unnest(${missing}::text[], ${missing.map((f) => migrations.get(f).sum)}::text[]) as v(name, sum) where m.name = v.name`;
    console.log(`ℹ ${missing.length} migrasi lama dicatat checksum-nya dari isi file sekarang (perubahan sebelum hari ini tidak terdeteksi).`);
  }
  // Migrasi terpasang yang isinya diubah: perubahannya tidak pernah dijalankan → berhenti sebelum
  // menjalankan apa pun (migrasi baru bisa bergantung pada perubahan itu).
  const changed = files.filter((f) => recorded.get(f) && recorded.get(f) !== migrations.get(f).sum);
  if (changed.length) {
    for (const name of changed) console.error(`✗ ${name} sudah terpasang tapi isinya berubah — perubahan itu TIDAK dijalankan; kembalikan isinya dan buat migrasi baru.`);
    throw new Error("migrasi dihentikan, tidak ada yang dijalankan");
  }
  const pending = files.filter((f) => !recorded.has(f));
  if (!pending.length) console.log("✓ Database sudah terbaru.");

  for (const file of pending) {
    const { text, sum } = migrations.get(file);
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name, checksum) values (${file}, ${sum})`;
    });
    console.log(`✓ migration ${file}`);
  }
} catch (error) {
  console.error("✗ Gagal:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
