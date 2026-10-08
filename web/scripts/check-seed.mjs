/**
 * Validasi supabase/seed.sql di Postgres sungguhan (PGlite): migrations + seed harus jalan
 * tanpa error, lalu cek beberapa angka penting.
 *
 *   npm run db:seed:check
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = path.resolve(import.meta.dirname, "../supabase");
const db = new PGlite({ extensions: { citext, pg_trgm, pgcrypto } });

// Stub skema auth Supabase (kolom yang dipakai seed).
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key, instance_id uuid, aud text, role text, email text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

for (const file of (await readdir(path.join(root, "migrations"))).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(path.join(root, "migrations", file), "utf8"));
}
const started = Date.now();
await db.exec(await readFile(path.join(root, "seed.sql"), "utf8"));

const rows = async (sql) => (await db.query(sql)).rows;
const [counts] = await rows(`select
  (select count(*) from profiles)::int as members,
  (select count(*) from staff_members)::int as staff,
  (select count(*) from sessions)::int as sessions,
  (select count(*) from bookings)::int as bookings,
  (select count(*) from orders)::int as orders,
  (select count(*) from product_variants)::int as variants`);
const tiers = await rows(`select tier, count(*)::int as n from profiles group by tier order by tier`);
const [arya] = await rows(`select p.full_name, p.tier, p.member_code, s.points_balance, s.sessions_attended
  from profiles p join member_stats s on s.member_id = p.id where p.member_code like 'SOS 0001 %'`);
const [nextOrder] = await rows(`insert into orders (subtotal, total, recipient_name, recipient_phone, shipping_address)
  values (1, 1, 'x', 'x', 'x') returning code`);

console.log(`✓ seed.sql dijalankan (${((Date.now() - started) / 1000).toFixed(1)} dtk)`);
console.log("  ", counts);
console.log("   tier:", tiers.map((t) => `${t.tier} ${t.n}`).join(" · "));
console.log("   member #1:", arya);
console.log("   order berikutnya:", nextOrder.code);
