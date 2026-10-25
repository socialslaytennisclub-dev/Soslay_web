/**
 * Validasi migrasi Supabase tanpa Docker: jalankan semua file di supabase/migrations
 * di Postgres sungguhan (PGlite, in-memory), lalu uji beberapa aturan penting.
 *
 *   node scripts/check-migrations.mjs
 *
 * Skema `auth` Supabase di-stub minimal (auth.users + auth.uid()) — cukup untuk FK & RLS.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const db = new PGlite({ extensions: { citext, pg_trgm, pgcrypto } });

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(path.join(dir, file), "utf8"));
  console.log(`✓ ${file}`);
}

// ── Uji perilaku ────────────────────────────────────────────────────────────
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const as = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
// Uji saldo di bawah memakai angka pasti → matikan bonus member baru dulu (diuji terpisah di akhir).
const setSignupBonus = (on) => db.query(`update app_settings set value = jsonb_set(value, '{bonuses,0,enabled}', $1::jsonb) where key = 'points_rules'`, [String(on)]);
await setSignupBonus(false);

const member = (await one(`insert into auth.users default values returning id`)).id;
await db.query(`insert into profiles (id, full_name, email, joined_at) values ($1, 'Arya Putra Dewangga', 'arya@mail.com', '2025-07-01')`, [member]);
const code = (await one(`select member_code from profiles where id = $1`, [member])).member_code;
console.assert(/^SOS \d{4} 2507$/.test(code), `member_code: ${code}`);

const venue = (await one(`insert into venues (slug, name, city) values ('cg', 'Common Grounds', 'Jakarta') returning id`)).id;
const session = (
  await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('s1', 'Mabar', 'weekly-mabar', $1, now() - interval '3 hours', now() - interval '1 hour', 24, 'completed', 2100) returning id`,
    [venue],
  )
).id;
const booking = (await one(`insert into bookings (session_id, member_id) values ($1, $2) returning id`, [session, member])).id;

// Hadir → poin otomatis → tier naik (2.100 ≥ ambang Gold 2.000)
await db.query(`update bookings set status = 'attended', checked_in_at = now() where id = $1`, [booking]);
await db.query(`update bookings set status = 'attended' where id = $1`, [booking]); // tidak dobel
const stats = await one(`select * from member_stats where member_id = $1`, [member]);
const tier = (await one(`select tier from profiles where id = $1`, [member])).tier;
console.assert(Number(stats.points_balance) === 2100, `points ${stats.points_balance}`);
console.assert(tier === "gold", `tier ${tier}`);
console.assert(Number(stats.sessions_attended) === 1 && Number(stats.hours_played) === 2, "stats");

// Member tidak boleh menaikkan tier sendiri
await as(member);
let blocked = false;
try {
  await db.query(`update profiles set tier = 'platinum' where id = $1`, [member]);
} catch {
  blocked = true;
}
console.assert(blocked, "member bisa mengubah tier sendiri!");
await db.query(`update profiles set display_name = 'Arya' where id = $1`, [member]); // boleh
await as(null);

const order = await one(`insert into orders (member_id, subtotal, total, recipient_name, recipient_phone, shipping_address)
  values ($1, 220000, 220000, 'Arya', '0812', 'Jl. Kemang') returning code`, [member]);
console.assert(/^SOS-\d+$/.test(order.code), `order code ${order.code}`);

const perms = await one(`select count(*)::int n from role_permissions`);
console.log(`✓ uji perilaku: member_code ${code}, poin & tier otomatis, proteksi kolom, order ${order.code}, ${perms.n} izin role`);

// my_admin_access(): staf aktif melihat role & izinnya sendiri, non-staf kosong.
{
  const staffUser = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(
    `insert into staff_members (user_id, role_id, full_name, email, status)
     select $1, id, 'Bima Pratama', 'bima@soslay.test', 'active' from roles where name = 'Coach'`,
    [staffUser],
  );
  await as(staffUser);
  const mine = await one(`select * from my_admin_access()`);
  console.assert(mine?.role_name === "Coach" && mine.permissions.activities === "edit" && mine.permissions.settings === undefined, `my_admin_access ${JSON.stringify(mine)}`);
  await as(member);
  console.assert((await db.query(`select * from my_admin_access()`)).rows.length === 0, "non-staf tidak punya akses admin");
  await as(null);
  console.log("✓ my_admin_access: Coach → activities edit, member biasa → kosong");
}

// Batal check-in → poin kehadiran ditarik lagi.
{
  const [{ id: m2 }] = (await db.query(`insert into auth.users default values returning id`)).rows;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Uji Batal', 'batal@mail.com')`, [m2]);
  const s2 = (await one(`select id from sessions limit 1`)).id;
  const b2 = (await one(`insert into bookings (session_id, member_id) values ($1, $2) returning id`, [s2, m2])).id;
  await db.query(`update bookings set status = 'attended' where id = $1`, [b2]);
  const before = Number((await one(`select points_balance from member_stats where member_id = $1`, [m2])).points_balance);
  await db.query(`update bookings set status = 'registered' where id = $1`, [b2]);
  const after = Number((await one(`select points_balance from member_stats where member_id = $1`, [m2])).points_balance);
  console.assert(before > 0 && after === 0, `undo check-in ${before} → ${after}`);
  console.log(`✓ batal check-in menarik poin (${before} → ${after})`);
}

// Penukaran reward: harga dari server, saldo dipotong saat disetujui, dikembalikan saat ditolak.
{
  const [{ id: m3 }] = (await db.query(`insert into auth.users default values returning id`)).rows;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Uji Tukar', 'tukar@mail.com')`, [m3]);
  const admin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(
    `insert into staff_members (user_id, role_id, full_name, email, status)
     select $1, id, 'Rara', 'rara@soslay.test', 'active' from roles where name = 'Super Admin'`,
    [admin],
  );
  await db.query(`insert into points_ledger (member_id, delta, reason, note) values ($1, 1000, 'bonus', 'uji')`, [m3]);
  const reward = await one(`select id, stock from rewards where name = 'Tote bag Slay Club'`);
  await as(m3);
  const rd = await one(`insert into reward_redemptions (member_id, reward_id, points, status) values ($1, $2, 1, 'fulfilled') returning code, points, status`, [m3, reward.id]);
  console.assert(rd.points === 900 && rd.status === "pending", `harga dari server ${JSON.stringify(rd)}`);
  let denied = false;
  try {
    await db.query(`select set_redemption_status($1, 'approved')`, [rd.code]);
  } catch {
    denied = true;
  }
  console.assert(denied, "member bisa menyetujui penukaran sendiri!");
  await as(admin);
  await db.query(`select set_redemption_status($1, 'approved')`, [rd.code]);
  const bal = async () => Number((await one(`select points_balance from member_stats where member_id = $1`, [m3])).points_balance);
  const stock = async () => (await one(`select stock from rewards where id = $1`, [reward.id])).stock;
  console.assert((await bal()) === 100 && (await stock()) === reward.stock - 1, "potong poin & stok");
  await db.query(`select set_redemption_status($1, 'rejected', 'stok rusak')`, [rd.code]);
  console.assert((await bal()) === 1000 && (await stock()) === reward.stock, "refund poin & stok");
  let invalid = false;
  try {
    await db.query(`select set_redemption_status($1, 'approved')`, [rd.code]);
  } catch {
    invalid = true;
  }
  console.assert(invalid, "penukaran ditolak bisa disetujui lagi!");
  await as(null);
  console.log(`✓ penukaran ${rd.code}: harga dari server, potong 900 pts + stok, refund saat ditolak`);
}

// Poin otomatis: bonus member baru + belanja Shop saat order selesai (sekali per order).
{
  await setSignupBonus(true);
  const [{ id: m4 }] = (await db.query(`insert into auth.users default values returning id`)).rows;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Uji Bonus', 'bonus@mail.com')`, [m4]);
  const bal = async () => Number((await one(`select points_balance from member_stats where member_id = $1`, [m4])).points_balance);
  console.assert((await bal()) === 100, `bonus member baru ${await bal()}`);
  const o = await one(`insert into orders (member_id, subtotal, total, recipient_name, recipient_phone, shipping_address)
    values ($1, 235000, 250000, 'Uji', '0812', 'Jl. Uji') returning id`, [m4]);
  await db.query(`update orders set status = 'completed' where id = $1`, [o.id]);
  await db.query(`update orders set status = 'shipped' where id = $1`, [o.id]);
  await db.query(`update orders set status = 'completed' where id = $1`, [o.id]);
  console.assert((await bal()) === 123, `poin belanja ${await bal()}`);
  console.log("✓ poin otomatis: member baru +100, belanja Rp235.000 → +23 (sekali per order)");
}

// Daftar dari website: metadata signup=member → profil otomatis; akun lain (undangan staf) tidak.
{
  const meta = { signup: "member", full_name: "Uji Daftar", display_name: "Uji", kuy_id: "ujidaftar", phone: "812-3456 7890", birth_date: "2001-07-05" };
  const u = await one(`insert into auth.users (email, raw_user_meta_data) values ('daftar@mail.com', $1) returning id`, [meta]);
  const p = await one(`select full_name, display_name, kuy_id::text, phone, birth_date::text, member_code from profiles where id = $1`, [u.id]);
  console.assert(p && p.full_name === "Uji Daftar" && p.kuy_id === "ujidaftar" && p.phone === "81234567890" && p.birth_date === "2001-07-05", `profil daftar ${JSON.stringify(p)}`);
  console.assert(/^SOS \d{4} \d{4}$/.test(p.member_code), `member_code daftar ${p.member_code}`);
  const staff = await one(`insert into auth.users (email, raw_user_meta_data) values ('staf@mail.com', '{}') returning id`);
  console.assert(!(await one(`select 1 from profiles where id = $1`, [staff.id])), "undangan staf ikut dibuatkan profil!");
  console.assert((await one(`select kuy_id_available('UjiDaftar') ok`)).ok === false, "Kuy ID terpakai dianggap tersedia");
  console.assert((await one(`select kuy_id_available('baru') ok`)).ok === true, "Kuy ID baru dianggap terpakai");
  const byAdmin = await one(`insert into auth.users (email, raw_user_meta_data) values ('tambah@mail.com', $1) returning id`, [{ signup: "member", full_name: "Dari Admin", city: "Bandung", tennis_level: "intermediate" }]);
  const pa = await one(`select city, tennis_level::text from profiles where id = $1`, [byAdmin.id]);
  console.assert(pa?.city === "Bandung" && pa?.tennis_level === "intermediate", `tambah member admin ${JSON.stringify(pa)}`);
  console.log("✓ daftar member: profil otomatis dari metadata (+ kota/level dari admin), staf tidak, cek Kuy ID");
}

// Sesi Americano: peserta import Kuyy, host per sesi (berakhir saat sesi diakhiri), skor host.
{
  const newMember = async (name, email) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, email]);
    return id;
  };
  const venueId = (await one(`select id from venues limit 1`)).id;
  const s = (
    await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, points_per_attendance)
       values ('slay-am', 'Slaymericano', 'weekly-mabar', $1, now(), now() + interval '4 hours', 18, 'published', 'americano', 50) returning id`,
      [venueId],
    )
  ).id;
  const hostId = await newMember("Host Arya", "host@mail.com");
  const player = await newMember("Pemain Member", "pemain@mail.com");
  const outsider = await newMember("Bukan Host", "lain@mail.com");
  await db.query(`insert into session_hosts (session_id, member_id) values ($1, $2)`, [s, hostId]);
  const ids = [];
  for (const [i, name] of ["Gavin", "Lucky", "Nadya", "Pemain Member"].entries()) {
    const row = await one(
      `insert into session_participants (session_id, full_name, kuy_reg_no, member_id, amount) values ($1, $2, $3, $4, 255000) returning id`,
      [s, name, `U${i + 1}`, name === "Pemain Member" ? player : null],
    );
    ids.push(row.id);
  }
  const booking = await one(`select status, source, payment_status from bookings where session_id = $1 and member_id = $2`, [s, player]);
  console.assert(booking?.source === "kuy" && booking.payment_status === "paid", `booking import ${JSON.stringify(booking)}`);
  const match = (await one(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2) values ($1, 1, 1, $2, $3, $4, $5) returning id`, [s, ...ids])).id;

  const fails = async (sql, params) => {
    try {
      await db.query(sql, params);
      return false;
    } catch {
      return true;
    }
  };
  const ptsBefore = Number((await one(`select points_balance from member_stats where member_id = $1`, [player])).points_balance);
  await as(outsider);
  console.assert(await fails(`select save_match_score($1, 12::smallint, 9::smallint)`, [match]), "member biasa bisa input skor!");
  console.assert(!(await one(`select is_session_host($1) ok`, [s])).ok, "member biasa dianggap host");
  await as(hostId);
  console.assert((await one(`select is_session_host($1) ok`, [s])).ok, "host tidak dikenali");
  console.assert(await fails(`select save_match_score($1, 12::smallint, 8::smallint)`, [match]), "total ≠ 21 diterima!");
  await db.query(`select save_match_score($1, 12::smallint, 9::smallint)`, [match]);
  await db.query(`select set_participant_check_in($1, true)`, [ids[3]]);
  await as(null);
  const scored = await one(`select score_a, score_b, scored_by from session_matches where id = $1`, [match]);
  console.assert(scored.score_a === 12 && scored.score_b === 9 && scored.scored_by === hostId, `skor host ${JSON.stringify(scored)}`);
  const attended = await one(`select status from bookings where session_id = $1 and member_id = $2`, [s, player]);
  const pts = Number((await one(`select points_balance from member_stats where member_id = $1`, [player])).points_balance);
  console.assert(attended.status === "attended" && pts - ptsBefore === 50, `check-in host → booking ${attended.status}, poin ${pts}`);

  // Sesi visibilitas Link tetap terbaca oleh pesertanya (My Activities), tidak oleh member lain.
  // (checker berjalan sebagai superuser → RLS diuji dengan role authenticated.)
  await db.query(`update sessions set visibility = 'link' where id = $1`, [s]);
  await db.exec(`grant usage on schema public to authenticated; grant select on sessions to authenticated;`);
  const visibleTo = async (uid) => {
    await as(uid);
    await db.exec(`set role authenticated`);
    const { n } = await one(`select count(*)::int n from sessions where id = $1`, [s]);
    await db.exec(`reset role`);
    return n;
  };
  console.assert((await visibleTo(player)) === 1, "peserta tidak bisa membaca sesi Link yang ia ikuti!");
  console.assert((await visibleTo(outsider)) === 0, "sesi Link terbaca member yang bukan peserta!");
  await as(null);

  // Sesi diakhiri → hak host berakhir, kembali member biasa.
  await db.query(`update sessions set ended_at = now(), status = 'completed' where id = $1`, [s]);
  await as(hostId);
  console.assert(!(await one(`select is_session_host($1) ok`, [s])).ok, "host masih aktif setelah sesi diakhiri!");
  console.assert(await fails(`select save_match_score($1, 10::smallint, 11::smallint)`, [match]), "host bisa ubah skor setelah sesi diakhiri!");
  await as(null);
  console.log("✓ americano: import Kuyy → booking member, host input skor (total 21) & check-in (+50 pts), hak host berakhir saat sesi diakhiri");
}

// Ghost member: peserta belum daftar dikumpulkan per Kuy ID; saat daftar → riwayat & poin pindah ke akunnya.
{
  const venueId = (await one(`select id from venues limit 1`)).id;
  const mkSession = async (slug, startsAt) =>
    (await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
       values ($1, 'Mabar Ghost', 'weekly-mabar', $2, $3::timestamptz, $3::timestamptz + interval '3 hours', 20, 'published', 50) returning id`,
      [slug, venueId, startsAt],
    )).id;
  const s1 = await mkSession("ghost-1", "2026-09-01T00:00:00Z");
  const s2 = await mkSession("ghost-2", "2026-09-08T00:00:00Z");
  const ghost = (await one(`insert into ghost_members (kuy_id, full_name, email, phone) values ('dindatest', 'Dinda P', 'dinda@ghost.test', '81200000102') returning id`)).id;
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, ghost_id, checked_in_at) values ($1, 'Dinda P', 'U1', $2, now())`, [s1, ghost]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, ghost_id) values ($1, 'Dinda P', 'U3', $2)`, [s2, ghost]);
  const before = await one(`select count(*)::int n from bookings b join profiles p on p.id = b.member_id where p.email = 'dinda@ghost.test'`);
  console.assert(before.n === 0, "ghost belum punya booking");

  // Daftar lewat website (email beda, Kuy ID sama) → ghost diklaim.
  const u = await one(`insert into auth.users (email, raw_user_meta_data) values ('dinda.baru@mail.com', $1) returning id`, [{ signup: "member", full_name: "Dinda Prameswari", kuy_id: "DindaTest" }]);
  const claimed = await one(`select claimed_by from ghost_members where id = $1`, [ghost]);
  const linked = await one(`select count(*)::int n from session_participants where ghost_id = $1 and member_id = $2`, [ghost, u.id]);
  const bookings = await db.query(`select status::text from bookings where member_id = $1 order by status::text`, [u.id]);
  const pts = Number((await one(`select points_balance from member_stats where member_id = $1`, [u.id])).points_balance);
  console.assert(claimed.claimed_by === u.id, "ghost tidak diklaim saat daftar");
  console.assert(linked.n === 2, `riwayat ghost tertaut ${linked.n}`);
  console.assert(bookings.rows.map((r) => r.status).join() === "attended,registered", `booking ghost ${JSON.stringify(bookings.rows)}`);
  console.assert(pts >= 50, `poin kehadiran ghost ${pts}`);
  console.log(`✓ ghost member: 2 aktivitas dikenali via Kuy ID, daftar → riwayat pindah + poin hadir (${pts} pts)`);
}
