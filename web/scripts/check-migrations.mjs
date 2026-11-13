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
  -- Seperti Supabase: fungsi baru di schema public otomatis bisa dieksekusi anon & authenticated
  -- (revoke "from public" saja tidak cukup).
  alter default privileges in schema public grant execute on functions to anon, authenticated;
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
// Bonus juara per activity: default kolom = DEFAULT_PODIUM_BONUS di web/src/lib/standings.ts (diuji di akhir).
// Uji lama memakai sesi "aturan lama" (podium_bonus NULL = 100 / 75 / 50), jadi default dilepas sementara.
{
  const { readFileSync } = await import("node:fs");
  const ts = readFileSync(new URL("../src/lib/standings.ts", import.meta.url), "utf8").match(/DEFAULT_PODIUM_BONUS = \[([\d,\s]+)\]/)?.[1].replace(/\s/g, "");
  const sqlDefault = (await one(`select column_default d from information_schema.columns where table_name = 'sessions' and column_name = 'podium_bonus'`)).d;
  console.assert(ts === "10,0,0" && sqlDefault.startsWith(`'{${ts}}'`), `default bonus juara: kode ${ts} vs database ${sqlDefault}`);
  await db.exec(`alter table sessions alter column podium_bonus drop default`);
}
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
  // Rotating Partner: tanpa target poin — skor bebas (6–4), hanya 0–0 yang ditolak.
  await as(null);
  await db.query(`update sessions set match_format = 'rotating' where id = $1`, [s]);
  await as(hostId);
  await db.query(`select save_match_score($1, 6::smallint, 4::smallint)`, [match]);
  console.assert((await one(`select score_a, score_b from session_matches where id = $1`, [match])).score_b === 4, "rotating: skor bebas ditolak");
  console.assert(await fails(`select save_match_score($1, 0::smallint, 0::smallint)`, [match]), "rotating: 0–0 diterima!");
  // Aplikasi membaca HINT (bukan teks pesan) untuk pesan error Panel Host.
  const hintOf = async (a, b) => db.query(`select save_match_score($1, ${a}::smallint, ${b}::smallint)`, [match]).then(() => null, (e) => e.hint);
  console.assert((await hintOf(0, 0)) === "score_zero", "HINT score_zero hilang");
  // Format lain selain Americano juga tanpa target poin.
  await as(null);
  await db.query(`update sessions set match_format = 'round_robin' where id = $1`, [s]);
  await as(hostId);
  await db.query(`select save_match_score($1, 5::smallint, 3::smallint)`, [match]);
  await as(null);
  await db.query(`update sessions set match_format = 'americano' where id = $1`, [s]);
  await as(hostId);
  console.assert((await hintOf(12, 8)) === "score_total", "HINT score_total hilang");
  await as(null);
  await db.query(`update sessions set match_format = 'americano' where id = $1`, [s]);
  await as(hostId);
  await db.query(`select save_match_score($1, 12::smallint, 9::smallint)`, [match]);
  // Urungkan dari Panel Host: kosongkan lalu simpan lagi; member biasa tidak boleh.
  await db.query(`select clear_match_score($1)`, [match]);
  console.assert((await one(`select score_a from session_matches where id = $1`, [match])).score_a === null, "urungkan skor gagal");
  await db.query(`select save_match_score($1, 12::smallint, 9::smallint)`, [match]);
  await db.query(`select set_participant_check_in($1, true)`, [ids[3]]);
  // Mulai / lompat ronde (UIF-13): ronde harus ada di line-up; tercatat di started_rounds.
  console.assert(await fails(`select start_session_round($1, 5::smallint)`, [s]), "ronde tanpa line-up bisa dimulai!");
  await db.query(`select start_session_round($1, 1::smallint)`, [s]);
  await db.query(`select start_session_round($1, 1::smallint)`, [s]);
  const started = await one(`select current_round, started_rounds, live_started_at from sessions where id = $1`, [s]);
  console.assert(started.current_round === 1 && started.started_rounds.join() === "1" && started.live_started_at, `mulai ronde ${JSON.stringify(started)}`);
  // Lompat ke R3 saat R2 tampil live (current_round kosong, R1 lengkap) → R2 ikut tercatat, bukan Dilewati.
  for (const round of [2, 3]) await db.query(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2) values ($1, $2, 1, $3, $4, $5, $6)`, [s, round, ...ids]);
  await as(null);
  await db.query(`update sessions set current_round = null, started_rounds = '{}' where id = $1`, [s]);
  await as(hostId);
  await db.query(`select start_session_round($1, 3::smallint)`, [s]);
  const jumped = await one(`select current_round, started_rounds from sessions where id = $1`, [s]);
  console.assert(jumped.current_round === 3 && jumped.started_rounds.join() === "2,3", `lompat ronde ${JSON.stringify(jumped)}`);
  // Mulai Activity (S1-H): sesi yang sudah live tidak berubah rondenya; dari awal → ronde pertama live.
  await db.query(`select start_session_activity($1)`, [s]);
  console.assert((await one(`select current_round from sessions where id = $1`, [s])).current_round === 3, "Mulai Activity mengubah ronde live!");
  await as(null);
  await db.query(`update sessions set current_round = null, started_rounds = '{}', live_started_at = null, starts_at = now() + interval '20 minutes' where id = $1`, [s]);
  await as(hostId);
  await db.query(`select start_session_activity($1)`, [s]);
  const begun = await one(`select current_round, started_rounds, live_started_at from sessions where id = $1`, [s]);
  console.assert(begun.current_round === 1 && begun.started_rounds.join() === "1" && begun.live_started_at, `mulai activity ${JSON.stringify(begun)}`);
  await as(null);
  await db.query(`update sessions set starts_at = now() + interval '2 hours', live_started_at = null where id = $1`, [s]);
  await as(hostId);
  console.assert(await fails(`select start_session_activity($1)`, [s]), "host bisa mulai activity 2 jam sebelum jadwal!");
  await as(null);
  await db.query(`update sessions set starts_at = now(), current_round = 3, started_rounds = '{2,3}' where id = $1`, [s]);
  await as(hostId);
  // Host hanya bisa mulai ronde selama jadwal sesi berjalan (sebelum mulai / setelah selesai → ditolak).
  await as(null);
  await db.query(`update sessions set starts_at = now() + interval '1 day', ends_at = now() + interval '2 days', live_started_at = null where id = $1`, [s]);
  await as(hostId);
  console.assert(await fails(`select start_session_round($1, 1::smallint)`, [s]), "host bisa mulai ronde sebelum sesi mulai!");
  await as(null);
  await db.query(`update sessions set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 hour' where id = $1`, [s]);
  await as(hostId);
  console.assert(await fails(`select start_session_round($1, 1::smallint)`, [s]), "host bisa mulai ronde setelah jadwal sesi lewat!");
  await as(null);
  await db.query(`update sessions set starts_at = now(), ends_at = now() + interval '4 hours' where id = $1`, [s]);
  await as(hostId);
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
  // Roster: peserta melihat semua nama di sesinya, member lain tidak melihat apa pun.
  await as(player);
  const roster = (await db.query(`select name from session_roster($1)`, [s])).rows.map((r) => r.name);
  console.assert(roster.length === 4 && roster.includes("Gavin") && roster.includes("Pemain Member"), `roster peserta ${JSON.stringify(roster)}`);
  await as(outsider);
  console.assert((await db.query(`select 1 from session_roster($1)`, [s])).rows.length === 0, "roster terbaca member yang bukan peserta!");
  // Host yang ditunjuk (bukan peserta) membaca sesi Link-nya + roster.
  console.assert((await visibleTo(hostId)) === 1, "host tidak bisa membaca sesi yang ia pegang!");
  await as(hostId);
  console.assert((await db.query(`select 1 from session_roster($1)`, [s])).rows.length === 4, "roster tidak terbaca host");
  await as(outsider);
  console.assert(await fails(`select clear_match_score($1)`, [match]), "member biasa bisa mengurungkan skor!");
  console.assert(await fails(`select start_session_round($1, 1::smallint)`, [s]), "member biasa bisa memulai ronde!");
  await as(null);

  // Line-up dari Panel Host (Atur line-up / Acak ulang): match tanpa skor mulai ronde 2 diganti; pemain dobel ditolak.
  await as(hostId);
  const swap = (round) => ({ round_no: round, court_no: 1, a1: ids[0], a2: ids[2], b1: ids[1], b2: ids[3] });
  await db.query(`select host_save_lineup($1, 2::smallint, $2::jsonb)`, [s, JSON.stringify([swap(2), swap(3)])]);
  const r2 = await one(`select a2, count(*) over () n from session_matches where session_id = $1 and round_no = 2`, [s]);
  console.assert(r2.a2 === ids[2] && Number(r2.n) === 1, `line-up host ${JSON.stringify(r2)}`);
  console.assert(await fails(`select host_save_lineup($1, 2::smallint, $2::jsonb)`, [s, JSON.stringify([swap(2), { ...swap(2), court_no: 2 }])]), "pemain dobel dalam satu ronde diterima!");
  console.assert(
    (await one(`select score_a from session_matches where session_id = $1 and round_no = 1`, [s])).score_a === 12,
    "match berskor ikut terganti line-up host!",
  );
  await as(outsider);
  console.assert(await fails(`select host_save_lineup($1, 2::smallint, '[]'::jsonb)`, [s]), "member biasa bisa mengubah line-up!");
  console.assert(await fails(`select end_session_activity($1)`, [s]), "member biasa bisa mengakhiri sesi!");
  console.assert(await fails(`select host_set_check_in($1, $2, true)`, [s, ids[0]]), "member biasa bisa check-in peserta!");
  for (const role of ["anon", "authenticated"]) {
    const ok = (await one(`select has_function_privilege($1, 'session_participant_for(uuid, uuid)', 'execute') ok`, [role])).ok;
    console.assert(!ok, `${role} bisa memanggil session_participant_for langsung!`);
  }

  // Member yang daftar lewat website (id roster = member_id): host check-in → baris peserta + booking hadir (+50), lalu bisa masuk line-up.
  await as(null);
  const web = await newMember("Daftar Web", "web@mail.com");
  await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, web]);
  const webPtsBefore = Number((await one(`select points_balance from member_stats where member_id = $1`, [web])).points_balance);
  await as(hostId);
  await db.query(`select host_set_check_in($1, $2, true)`, [s, web]);
  await as(null);
  const webRow = await one(`select id, source, checked_in_at from session_participants where session_id = $1 and member_id = $2`, [s, web]);
  const webBooking = await one(`select status from bookings where session_id = $1 and member_id = $2`, [s, web]);
  const webPts = Number((await one(`select points_balance from member_stats where member_id = $1`, [web])).points_balance) - webPtsBefore;
  console.assert(webRow?.source === "website" && webRow.checked_in_at && webBooking.status === "attended" && webPts === 50, `check-in member website ${JSON.stringify({ webRow, webBooking, webPts })}`);
  await as(hostId);
  await db.query(`select host_save_lineup($1, 3::smallint, $2::jsonb)`, [s, JSON.stringify([{ round_no: 3, court_no: 1, a1: ids[0], a2: ids[1], b1: ids[2], b2: web }])]);
  console.assert((await one(`select b2 from session_matches where session_id = $1 and round_no = 3`, [s])).b2 === webRow.id, "member website tidak masuk line-up host!");
  console.assert(await fails(`select host_save_lineup($1, 3::smallint, $2::jsonb)`, [s, JSON.stringify([{ round_no: 3, court_no: 1, a1: ids[0], a2: ids[1], b1: ids[2], b2: outsider }])]), "bukan peserta masuk line-up host!");

  // Akhiri Activity oleh host → sesi selesai + bonus juara (R1 12–9: tim B peringkat 3 → Pemain Member +50).
  await as(hostId);
  const ptsBeforeEnd = Number((await one(`select points_balance from member_stats where member_id = $1`, [player])).points_balance);
  await db.query(`select end_session_activity($1)`, [s]);
  const ended = await one(`select status, ended_at, ended_by from sessions where id = $1`, [s]);
  console.assert(ended.status === "completed" && ended.ended_at && ended.ended_by === hostId, `akhiri activity ${JSON.stringify(ended)}`);
  const ptsAfterEnd = Number((await one(`select points_balance from member_stats where member_id = $1`, [player])).points_balance);
  console.assert(ptsAfterEnd - ptsBeforeEnd === 50, `bonus juara #3 → +${ptsAfterEnd - ptsBeforeEnd} (harusnya +50)`);
  console.assert(await fails(`select end_session_activity($1)`, [s]), "sesi bisa diakhiri dua kali!");

  // Review peserta: +10 sekali, bisa diubah; bukan peserta ditolak.
  await as(player);
  await db.query(`select submit_session_review($1, 4::smallint, '{Host ramah}', 5::smallint, 4::smallint, 4::smallint, 'Seru!', true)`, [s]);
  await db.query(`select submit_session_review($1, 5::smallint, '{}', null, null, null, 'Seru banget', false)`, [s]);
  const review = await one(`select rating, comment from session_reviews where session_id = $1 and member_id = $2`, [s, player]);
  console.assert(review.rating === 5 && review.comment === "Seru banget", `review ${JSON.stringify(review)}`);
  await as(null);
  const ptsAfterReview = Number((await one(`select points_balance from member_stats where member_id = $1`, [player])).points_balance);
  console.assert(ptsAfterReview - ptsAfterEnd === 10, `review → +${ptsAfterReview - ptsAfterEnd} (harusnya +10 sekali)`);
  await as(outsider);
  console.assert(await fails(`select submit_session_review($1, 5::smallint, '{}', null, null, null, null, false)`, [s]), "bukan peserta bisa memberi review!");

  // Sesi diakhiri → hak host berakhir, kembali member biasa.
  await as(hostId);
  console.assert(!(await one(`select is_session_host($1) ok`, [s])).ok, "host masih aktif setelah sesi diakhiri!");
  console.assert(await fails(`select save_match_score($1, 10::smallint, 11::smallint)`, [match]), "host bisa ubah skor setelah sesi diakhiri!");
  await as(null);
  console.log("✓ americano: import Kuyy → booking member, host input skor (total 21) & check-in (+50 pts), hak host berakhir saat sesi diakhiri");
}

// Jeda tutup 30 menit: host masih bisa input skor selama jeda, terkunci setelahnya; sesi yang
// lewat jeda ditutup sungguhan oleh close_expired_sessions() (completed + bonus juara, sekali).
{
  const newMember = async (name, email) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, email]);
    return id;
  };
  const fails = async (sql, params) => db.query(sql, params).then(() => false, () => true);
  const balance = async (m) => Number((await one(`select points_balance from member_stats where member_id = $1`, [m])).points_balance);
  const venueId = (await one(`select id from venues limit 1`)).id;
  // Selesai 10 menit lalu → masih dalam jeda.
  const s = (
    await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, points_per_attendance)
       values ('slay-grace', 'Slaymericano Jeda', 'weekly-mabar', $1, now() - interval '130 minutes', now() - interval '10 minutes', 8, 'published', 'americano', 50) returning id`,
      [venueId],
    )
  ).id;
  const host = await newMember("Host Jeda", "host-jeda@mail.com");
  const winner = await newMember("Juara Jeda", "juara-jeda@mail.com");
  await db.query(`insert into session_hosts (session_id, member_id) values ($1, $2)`, [s, host]);
  const ids = [];
  for (const [i, name] of ["Juara Jeda", "Rani", "Sinta", "Dodi"].entries()) {
    ids.push((await one(`insert into session_participants (session_id, full_name, kuy_reg_no, member_id) values ($1, $2, $3, $4) returning id`, [s, name, `G${i + 1}`, i === 0 ? winner : null])).id);
  }
  const match = (await one(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2) values ($1, 1, 1, $2, $3, $4, $5) returning id`, [s, ...ids])).id;

  await as(host);
  console.assert(!(await fails(`select save_match_score($1, 15::smallint, 6::smallint)`, [match])), "host tidak bisa input skor dalam jeda 30 menit!");
  await as(null);
  await db.query(`update sessions set starts_at = now() - interval '160 minutes', ends_at = now() - interval '40 minutes' where id = $1`, [s]);
  await as(host);
  console.assert(await fails(`select save_match_score($1, 10::smallint, 11::smallint)`, [match]), "host bisa ubah skor setelah sesi ditutup!");
  console.assert(await fails(`select host_set_check_in($1, $2, true)`, [s, ids[1]]), "host bisa check-in setelah sesi ditutup!");
  console.assert(await fails(`select host_save_lineup($1, 2::smallint, '[]'::jsonb)`, [s]), "host bisa ubah line-up setelah sesi ditutup!");

  await as(null);
  const before = await balance(winner);
  await as(winner);
  const closed = (await one(`select close_expired_sessions() n`)).n;
  await as(null);
  const row = await one(`select status, ended_by, ended_at = ends_at + interval '30 minutes' at_close from sessions where id = $1`, [s]);
  console.assert(closed >= 1 && row.status === "completed" && row.ended_by === null && row.at_close, `tutup otomatis ${JSON.stringify({ closed, row })}`);
  console.assert((await balance(winner)) - before === 100, `bonus juara tutup otomatis → +${(await balance(winner)) - before} (harusnya +100)`);
  await db.query(`select close_expired_sessions()`);
  console.assert((await balance(winner)) - before === 100, "bonus juara dibagikan dua kali oleh tutup otomatis!");
  console.assert(!(await one(`select has_function_privilege('anon', 'close_expired_sessions()', 'execute') ok`)).ok, "anon bisa memanggil close_expired_sessions");
  console.assert(!(await one(`select has_function_privilege('authenticated', 'finish_session(uuid, uuid, timestamptz)', 'execute') ok`)).ok, "member bisa memanggil finish_session langsung");

  // Durasi jeda SQL harus sama dengan web/src/lib/session-close.ts.
  const ts = await readFile(path.resolve(import.meta.dirname, "../src/lib/session-close.ts"), "utf8");
  const tsMinutes = Number(ts.match(/SESSION_CLOSE_GRACE_MS = (\d+) \* 60_000/)?.[1]);
  const sqlMinutes = Number((await one(`select extract(epoch from session_closes_at('2026-01-01') - '2026-01-01'::timestamptz) / 60 m`)).m);
  console.assert(tsMinutes > 0 && tsMinutes === sqlMinutes, `jeda tutup beda: TS ${tsMinutes} menit, SQL ${sqlMinutes} menit`);
  console.log(`✓ jeda tutup ${sqlMinutes} menit: host bisa skor dalam jeda, terkunci setelahnya; tutup otomatis → completed + bonus juara sekali`);
}

// Venue tersembunyi tetap terbaca bila dipakai sesi yang tampil di website (jendela 120 hari) atau
// sesi milik pemanggil (host / booking → My Activity); selain itu tetap tertutup.
{
  const venue = async (slug) => (await one(`insert into venues (slug, name, city, is_active) values ($1, $1, 'Jakarta', false) returning id`, [slug])).id;
  const [pub, old, link, unused] = [await venue("hv-public"), await venue("hv-old"), await venue("hv-link"), await venue("hv-unused")];
  const session = async (slug, venueId, startOffset, status, visibility) =>
    (
      await one(
        `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, visibility)
         values ($1, $1, 'weekly-mabar', $2, now() + $3::interval, now() + $3::interval + interval '2 hours', 8, $4, $5) returning id`,
        [slug, venueId, startOffset, status, visibility],
      )
    ).id;
  await session("hv-s-public", pub, "1 day", "published", "public");
  await session("hv-s-old", old, "-200 days", "completed", "public");
  const linkSession = await session("hv-s-link", link, "1 day", "published", "link");
  const { id: host } = await one(`insert into auth.users default values returning id`);
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Host Venue Baru', 'hv-host@example.com')`, [host]);
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host')`, [linkSession, host]);

  await db.exec(`grant usage on schema public to anon, authenticated; grant select on sessions, venues to anon, authenticated;`);
  const readable = async (role, uid, venueIds) => {
    await as(uid);
    await db.exec(`set role ${role}`);
    const { n } = await one(`select count(*)::int n from venues where id = any($1)`, [venueIds]);
    await db.exec(`reset role`);
    return n;
  };
  console.assert((await readable("anon", null, [pub])) === 1, "sesi di venue tersembunyi hilang dari website!");
  console.assert((await readable("anon", null, [old, link, unused])) === 0, "venue tersembunyi terbaca publik lewat sesi lama / Link / tanpa sesi!");
  console.assert((await readable("authenticated", host, [link])) === 1, "host tidak bisa membaca venue sesi Link-nya (My Activity)!");
  await db.exec(`revoke select on sessions, venues from anon; revoke usage on schema public from anon;`);
  await as(null);
  console.log("✓ venue tersembunyi: terbaca lewat sesi website & sesi milik host; sesi lama / Link / tanpa sesi tetap tertutup");
}

// Check-in peserta (admin, host, peserta susulan) → booking hadir + poin, juga booking yang dulu
// dibatalkan; batal check-in → booking kembali ke status semula (cancelled / registered), poin ditarik.
{
  const newMember = async (name) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${name}@example.com`]);
    return id;
  };
  const balance = async (m) => Number((await one(`select points_balance from member_stats where member_id = $1`, [m])).points_balance);
  const venueId = (await one(`select id from venues limit 1`)).id;
  const { id: s } = await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('late-add', 'Mabar Susulan', 'weekly-mabar', $1, now() - interval '1 day', now() - interval '22 hours', 8, 'completed', 50) returning id`,
    [venueId],
  );
  const [walkIn, cancelled] = [await newMember("late-walkin"), await newMember("late-cancelled")];
  await db.query(`insert into bookings (session_id, member_id, status, payment_status, source, amount) values ($1, $2, 'cancelled', 'paid', 'admin', 0)`, [s, cancelled]);
  const [before1, before2] = [await balance(walkIn), await balance(cancelled)];
  // Peserta susulan (play.ts lateCheckIn): baris langsung ber-checked_in_at.
  for (const [m, reg] of [[walkIn, "ADM-LATE1"], [cancelled, "ADM-LATE2"]])
    await db.query(`insert into session_participants (session_id, kuy_reg_no, member_id, full_name, source, checked_in_at) values ($1, $2, $3, 'x', 'admin', now())`, [s, reg, m]);
  const status = async (m) => (await one(`select status from bookings where session_id = $1 and member_id = $2`, [s, m])).status;
  console.assert((await status(walkIn)) === "attended" && (await balance(walkIn)) - before1 === 50, "peserta susulan tidak tercatat hadir / tanpa poin!");
  console.assert((await status(cancelled)) === "attended" && (await balance(cancelled)) - before2 === 50, "booking batal tidak dihidupkan saat check-in!");
  // Batal check-in (set_participant_check_in — jalur admin & host): kembali ke status semula, poin ditarik.
  const uncheck = async (reg) => db.query(`update session_participants set checked_in_at = null, checked_in_by = null where session_id = $1 and kuy_reg_no = $2`, [s, reg]);
  await uncheck("ADM-LATE1");
  await uncheck("ADM-LATE2");
  console.assert((await status(walkIn)) === "registered" && (await balance(walkIn)) === before1, "batal check-in tidak mengembalikan registered / poin!");
  console.assert((await status(cancelled)) === "cancelled" && (await balance(cancelled)) === before2, "batal check-in booking yang dihidupkan tidak kembali ke cancelled!");
  // Check-in lagi → hidup lagi (+50 sekali).
  await db.query(`update session_participants set checked_in_at = now() where session_id = $1 and kuy_reg_no = 'ADM-LATE2'`, [s]);
  console.assert((await status(cancelled)) === "attended" && (await balance(cancelled)) - before2 === 50, "check-in ulang booking batal gagal!");
  console.log("✓ check-in: booking batal ikut dihidupkan (+50), batal check-in → kembali cancelled / registered, poin ditarik");
}

// Check-in mandiri member (/akun/absensi): hanya peserta sendiri, hanya di jendela check-in.
{
  const venueId = (await one(`select id from venues limit 1`)).id;
  const mkSession = async (slug, startOffset) =>
    (await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
       values ($1, 'Mabar Absen', 'weekly-mabar', $2, now() + $3::interval, now() + $3::interval + interval '2 hours', 20, 'published', 50) returning id`,
      [slug, venueId, startOffset],
    )).id;
  const mkMember = async (name, email) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, email]);
    return id;
  };
  const fails = async (sql, params) => db.query(sql, params).then(() => false, () => true);
  const balance = async (m) => Number((await one(`select points_balance from member_stats where member_id = $1`, [m])).points_balance);

  const open = await mkSession("absen-open", "10 minutes");
  const later = await mkSession("absen-later", "2 hours");
  const past = await mkSession("absen-past", "-3 hours");
  // Selesai 10 menit lalu → masih dalam jeda tutup 30 menit (session_closes_at).
  const grace = await mkSession("absen-grace", "-130 minutes");
  const kuy = await mkMember("Peserta Kuy", "absen-kuy@mail.com");
  const web = await mkMember("Peserta Web", "absen-web@mail.com");
  const outsider = await mkMember("Bukan Peserta", "absen-lain@mail.com");
  for (const s of [open, later, past, grace]) {
    await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, member_id, amount) values ($1, 'Peserta Kuy', 'U1', $2, 150000)`, [s, kuy]);
  }
  await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [open, web]);

  await as(null);
  console.assert(await fails(`select member_self_check_in($1)`, [open]), "anon bisa check-in!");
  await as(outsider);
  console.assert(await fails(`select member_self_check_in($1)`, [open]), "bukan peserta bisa check-in!");
  await as(kuy);
  console.assert(await fails(`select member_self_check_in($1)`, [later]), "check-in sebelum jendela dibuka diterima!");
  // Admin me-live-kan sesi lebih awal → check-in mandiri ikut terbuka.
  await db.query(`update sessions set live_started_at = now() where id = $1`, [later]);
  console.assert(!(await fails(`select member_self_check_in($1)`, [later])), "check-in sesi yang sudah di-live-kan lebih awal ditolak!");
  console.assert(await fails(`select member_self_check_in($1)`, [past]), "check-in sesi yang sudah lewat diterima!");
  console.assert(!(await fails(`select member_self_check_in($1)`, [grace])), "check-in dalam jeda 30 menit setelah selesai ditolak!");

  await as(null);
  const kuyBefore = await balance(kuy);
  await as(kuy);
  const first = (await one(`select member_self_check_in($1) at`, [open])).at;
  const again = (await one(`select member_self_check_in($1) at`, [open])).at;
  await as(null);
  const kuyBooking = await one(`select status from bookings where session_id = $1 and member_id = $2`, [open, kuy]);
  console.assert(first && String(first) === String(again), `check-in ulang mengubah waktu ${first} → ${again}`);
  console.assert(kuyBooking.status === "attended" && (await balance(kuy)) - kuyBefore === 50, `check-in mandiri peserta Kuyy ${JSON.stringify(kuyBooking)} Δ${(await balance(kuy)) - kuyBefore}`);

  const webBefore = await balance(web);
  await as(web);
  await db.query(`select member_self_check_in($1)`, [open]);
  await as(null);
  const webRow = await one(`select source, checked_in_at, checked_in_by from session_participants where session_id = $1 and member_id = $2`, [open, web]);
  console.assert(webRow?.source === "website" && webRow.checked_in_at && webRow.checked_in_by === web && (await balance(web)) - webBefore === 50, `check-in mandiri booking website ${JSON.stringify(webRow)}`);
  console.assert(!(await one(`select has_function_privilege('anon', 'member_self_check_in(uuid)', 'execute') ok`)).ok, "anon punya akses member_self_check_in");
  console.log("✓ check-in mandiri: peserta sendiri, jendela 30 menit sebelum s.d. 30 menit setelah selesai, +50 pts sekali");
}

// Booking batal hanya dihidupkan panitia: host (bukan staf) bisa, member sendiri tidak (check-in
// mandiri ditolak); check-in langsung di bookings ikut dipulihkan; hadir → no_show juga kembali cancelled.
{
  const mk = async (name) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${name}@example.com`]);
    return id;
  };
  const venueId = (await one(`select id from venues limit 1`)).id;
  const { id: s } = await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('revive-rules', 'Mabar Aturan', 'weekly-mabar', $1, now() + interval '10 minutes', now() + interval '2 hours', 20, 'published', 50) returning id`,
    [venueId],
  );
  const [viaHost, self, direct, noShow, host, rebook] = [await mk("rv-host-p"), await mk("rv-self"), await mk("rv-direct"), await mk("rv-noshow"), await mk("rv-host"), await mk("rv-rebook")];
  for (const m of [viaHost, self, direct, noShow, host, rebook])
    await db.query(`insert into bookings (session_id, member_id, status, payment_status, source, amount) values ($1, $2, 'cancelled', 'paid', 'admin', 0)`, [s, m]);
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host')`, [s, host]);
  for (const [m, reg] of [[viaHost, "RV1"], [self, "RV2"], [noShow, "RV4"], [host, "RV5"], [rebook, "RV6"]])
    await db.query(`insert into session_participants (session_id, kuy_reg_no, member_id, full_name) values ($1, $2, $3, 'x')`, [s, reg, m]);
  const status = async (m) => (await one(`select status from bookings where session_id = $1 and member_id = $2`, [s, m])).status;
  const checkIn = (reg, by) => db.query(`update session_participants set checked_in_at = now(), checked_in_by = $3 where session_id = $1 and kuy_reg_no = $2`, [s, reg, by]);

  await checkIn("RV1", host);
  console.assert((await status(viaHost)) === "attended", "check-in host tidak menghidupkan booking batal!");
  await checkIn("RV2", self);
  console.assert((await status(self)) === "cancelled", "member menghidupkan booking batalnya sendiri!");
  await db.query(`update session_participants set checked_in_at = null where session_id = $1 and kuy_reg_no = 'RV2'`, [s]);
  await as(self);
  const refused = await db.query(`select member_self_check_in($1)`, [s]).then(() => "", (e) => e.message);
  console.assert(/sudah dibatalkan/.test(refused), `check-in mandiri booking batal: pesan "${refused}" (selfCheckIn di member/actions.ts mencocokkan "sudah dibatalkan")`);
  // Host yang ikut main men-check-in dirinya sendiri (Panel Host) → booking batalnya hidup. Dinilai
  // dari checked_in_by, bukan login pemanggil: tanpa JWT (script / service-role) hasilnya sama.
  await as(null);
  await checkIn("RV5", host);
  console.assert((await status(host)) === "attended", "host tidak bisa menghidupkan booking batalnya sendiri (tanpa JWT)!");
  // Check-in mandiri host sesi dengan booking batal: diterima (definisi panitia sama dengan trigger).
  const host2 = await mk("rv-host2");
  await db.query(`insert into bookings (session_id, member_id, status, payment_status, source, amount) values ($1, $2, 'cancelled', 'paid', 'admin', 0)`, [s, host2]);
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host')`, [s, host2]);
  await db.query(`insert into session_participants (session_id, kuy_reg_no, member_id, full_name) values ($1, 'RV7', $2, 'x')`, [s, host2]);
  await as(host2);
  const hostSelf = await db.query(`select member_self_check_in($1)`, [s]).then(() => "", (e) => e.message);
  await as(null);
  console.assert(!hostSelf && (await status(host2)) === "attended", `check-in mandiri host dengan booking batal: "${hostSelf}"`);
  // setCheckIn jalur booking langsung: hadir lalu batal (menulis registered) → kembali cancelled.
  await db.query(`update bookings set status = 'attended' where session_id = $1 and member_id = $2`, [s, direct]);
  await db.query(`update bookings set status = 'registered' where session_id = $1 and member_id = $2`, [s, direct]);
  console.assert((await status(direct)) === "cancelled", "batal check-in langsung tidak kembali ke cancelled!");
  // Dihidupkan lalu ditandai no_show → kembali cancelled.
  await checkIn("RV4", host);
  await db.query(`update bookings set status = 'no_show' where session_id = $1 and member_id = $2`, [s, noShow]);
  console.assert((await status(noShow)) === "cancelled", "booking hidup → no_show tidak kembali ke cancelled!");
  // Admin mem-booking-kan ulang (upsert registered, check-in tidak dihapus) → tetap registered.
  await checkIn("RV6", host);
  await db.query(`update bookings set status = 'registered' where session_id = $1 and member_id = $2`, [s, rebook]);
  console.assert((await status(rebook)) === "registered", "booking ulang oleh admin dipaksa jadi cancelled!");
  console.log("✓ booking batal: dihidupkan host/admin saja (juga host untuk dirinya), check-in mandiri ditolak + pesan; batal hadir / no_show → cancelled, booking ulang → registered");
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

// Keuangan (ADM-18): pencatatan otomatis dari Activities & Orders + RLS Pencatat keuangan.
{
  await as(null);
  await db.exec(`update finance_settings set go_live_date = '2020-01-01'`); // uji: anggap sudah go-live
  const venueId = (await one(`select id from venues limit 1`)).id;
  const sid = (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('fin-1', 'Mabar Keuangan', 'weekly-mabar', $1, now() + interval '2 days', now() + interval '2 days 3 hours', 20, 'published', 50) returning id`,
    [venueId],
  )).id;
  const net = async (source) => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = $1 and deleted_at is null`, [source])).s);

  // A-8: peserta Kuyy lunas → Tiket activity ke Saldo Kuyy, baru setelah activity selesai; Rp0 / menunggu /
  // tanpa username Kuyy tidak dicatat; ubah nominal / status / hapus → koreksi.
  const p1 = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Peserta A', 'F1', 'pesertaa', 150000) returning id`, [sid])).id;
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Peserta Rp0', 'F2', 'pesertab', 0)`, [sid]);
  // Roster yang disalin dari booking website (tanpa username Kuyy) bukan uang Kuyy.
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, amount) values ($1, 'Dari booking', 'B1', 150000)`, [sid]);
  const p5 = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount, payment_status) values ($1, 'Peserta DP', 'F5', 'pesertac', 120000, 'pending') returning id`, [sid])).id;
  console.assert((await net("kuyy_import")) === 0, "A-8: activity belum selesai → belum dicatat");
  await db.query(`update sessions set status = 'completed', ended_at = now() where id = $1`, [sid]);
  const first = await one(
    `select a.system_key, t.date::text = (s.starts_at at time zone 'Asia/Jakarta')::date::text same_day
     from finance_transactions t join finance_accounts a on a.id = t.account_id join sessions s on s.id = t.activity_session_id
     where t.source = 'kuyy_import' limit 1`,
  );
  console.assert((await net("kuyy_import")) === 150000 && first.system_key === "kuyy" && first.same_day, `A-8 activity selesai → peserta lunas tercatat di tanggal activity ${JSON.stringify(first)}`);
  await db.query(`update session_participants set payment_status = 'paid' where id = $1`, [p5]);
  console.assert((await net("kuyy_import")) === 270000, "A-8 menunggu → lunas setelah activity selesai");
  await db.query(`update session_participants set amount = 140000 where id = $1`, [p1]);
  console.assert((await net("kuyy_import")) === 260000, "A-8 koreksi nominal");
  await db.query(`update session_participants set payment_status = 'pending' where id = $1`, [p5]);
  console.assert((await net("kuyy_import")) === 140000, "A-8 lunas → menunggu → koreksi");
  // Via Manual (bayar langsung, bukan lewat Kuyy) → pindah dari Saldo Kuyy ke akun bayar manual (BCA), kedua
  // kaki di tanggal yang sama; pencatatan otomatis Kuyy yang dimatikan tetap mengoreksi sisanya (tidak dobel).
  await db.exec(`update finance_settings set auto_kuyy = false`);
  await db.query(`update session_participants set payment_channel = 'manual' where id = $1`, [p1]);
  await db.exec(`update finance_settings set auto_kuyy = true`);
  const manualAcc = await one(`select a.system_key from finance_transactions t join finance_accounts a on a.id = t.account_id where t.source = 'ticket_manual_paid' and t.source_ref = $1`, ['sp:' + p1]);
  console.assert((await net("kuyy_import")) === 0 && (await net("ticket_manual_paid")) === 140000 && manualAcc?.system_key === "bank_main", `A-8 via Manual → akun bayar manual ${JSON.stringify(manualAcc)}`);
  const legs = await one(`select count(distinct date)::int n from finance_transactions where source_ref = $1 and (source = 'ticket_manual_paid' or amount < 0)`, ['sp:' + p1]);
  console.assert(legs.n === 1, `pindah jalur: koreksi & pemasukan beda tanggal (${legs.n})`);
  // Bukan lagi baris file Kuyy (username dihapus) → dikoreksi; trigger update harus melihat is_kuy_import berubah.
  await db.query(`update session_participants set kuy_username = null where id = $1`, [p1]);
  console.assert((await net("ticket_manual_paid")) === 0, "A-8 baris jadi bukan file Kuyy → koreksi");
  await db.query(`update session_participants set kuy_username = 'pesertaa' where id = $1`, [p1]);
  console.assert((await net("ticket_manual_paid")) === 140000, "A-8 baris file Kuyy lagi → tercatat lagi");
  // Import ulang dengan nilai sama tidak menambah transaksi.
  const txCount = async () => Number((await one(`select count(*) n from finance_transactions`)).n);
  const before = await txCount();
  await db.query(`update session_participants set amount = amount, payment_status = payment_status where id = $1`, [p1]);
  console.assert((await txCount()) === before, "import ulang tanpa perubahan menambah transaksi");
  // Ganti nama → keterangan transaksi ikut, hanya akhiran " · <nama lama>" utuh yang diganti.
  await db.query(`update session_participants set full_name = 'Nama Baru' where id = $1`, [p1]);
  const renamed = await db.query(`select description from finance_transactions where source_ref = $1 and deleted_at is null`, ['sp:' + p1]);
  console.assert(renamed.rows.length > 0 && renamed.rows.every((r) => r.description.endsWith(" · Nama Baru")), `ganti nama peserta → keterangan transaksi ${JSON.stringify(renamed.rows)}`);
  await db.query(`update session_participants set full_name = 'Baru' where id = $1`, [p1]);
  const shorter = await db.query(`select description from finance_transactions where source_ref = $1 and deleted_at is null`, ['sp:' + p1]);
  console.assert(shorter.rows.every((r) => r.description.endsWith(" · Baru") && !r.description.includes("Nama")), `ganti nama: hanya akhiran utuh ${JSON.stringify(shorter.rows)}`);
  await db.query(`delete from session_participants where id = $1`, [p1]);
  console.assert((await net("kuyy_import")) === 0 && (await net("ticket_manual_paid")) === 0, "A-8 hapus peserta → koreksi");
  // Nominal yang diubah admin tidak tertimpa import ulang file Kuyy (yang menulis amount tanpa amount_edited_at).
  const p7 = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Peserta DP2', 'F7', 'pesertad', 250000) returning id`, [sid])).id;
  await db.query(`update session_participants set amount = 50000, amount_edited_at = now() where id = $1`, [p7]);
  await db.query(`update session_participants set amount = 250000 where id = $1`, [p7]);
  console.assert((await one(`select amount from session_participants where id = $1`, [p7])).amount === 50000, "import ulang menimpa nominal yang diubah admin");
  await db.query(`delete from session_participants where id = $1`, [p7]);
  // Booking admin yang masih menunggu tidak ikut jadi lunas saat roster disalin dari booking (tanpa username Kuyy).
  const adm = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Admin Booking', 'admbk@fin.test')`, [adm]);
  await db.query(`insert into bookings (session_id, member_id, source, amount, payment_status) values ($1, $2, 'admin', 150000, 'pending')`, [sid, adm]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, member_id, amount) values ($1, 'Admin Booking', 'B9', $2, 150000)`, [sid, adm]);
  const admBk = await one(`select payment_status::text from bookings where session_id = $1 and member_id = $2`, [sid, adm]);
  console.assert(admBk.payment_status === "pending", `salinan roster mengubah booking admin jadi ${admBk.payment_status}`);
  // Booking member ikut nominal & status bayar baris pesertanya.
  const pm = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Pay Sync', 'paysync@fin.test')`, [pm]);
  const pmRow = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, member_id, amount, payment_status) values ($1, 'Pay Sync', 'F6', 'paysync', $2, 90000, 'pending') returning id`, [sid, pm])).id;
  const pmBooking = () => one(`select payment_status::text, amount from bookings where session_id = $1 and member_id = $2`, [sid, pm]);
  console.assert((await pmBooking()).payment_status === "pending", `booking ikut status menunggu ${JSON.stringify(await pmBooking())}`);
  await db.query(`update session_participants set payment_status = 'paid', amount = 95000 where id = $1`, [pmRow]);
  const synced = await pmBooking();
  console.assert(synced.payment_status === "paid" && synced.amount === 95000, `booking ikut lunas & nominal ${JSON.stringify(synced)}`);
  await db.query(`delete from session_participants where id = $1`, [pmRow]);
  console.assert((await net("kuyy_import")) === 0, "hapus Pay Sync → koreksi");
  const code = (await one(`select code from finance_transactions where source = 'kuyy_import' order by created_at limit 1`)).code;
  console.assert(/^TRX-\d{4}-\d{4}$/.test(code), `kode transaksi ${code}`);

  // A-7: Tandai Lunas lewat RPC → pemasukan ke akun default; batal lunas → koreksi. Perubahan status
  // lunas dari jalur lain (mis. payment gateway) tidak dicatat sebagai bayar manual.
  const u = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Mira Lunas', 'mira@fin.test')`, [u]);
  const bk = (await one(`insert into bookings (session_id, member_id, source, amount) values ($1, $2, 'admin', 150000) returning id`, [sid, u])).id;
  await db.query(`update bookings set payment_status = 'paid' where id = $1`, [bk]);
  console.assert((await net("ticket_manual_paid")) === 0, "A-7: lunas dari jalur lain tidak dicatat sebagai bayar manual");
  await db.query(`update bookings set payment_status = 'pending' where id = $1`, [bk]);
  const fsa = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Fina', 'fina@soslay.test', 'active' from roles where name = 'Super Admin'`, [fsa]);
  await as(fsa);
  await db.query(`select mark_booking_paid($1, true)`, [bk]);
  console.assert((await net("ticket_manual_paid")) === 150000, "A-7 Tandai Lunas");
  await db.query(`select mark_booking_paid($1, false)`, [bk]);
  console.assert((await net("ticket_manual_paid")) === 0, "A-7 batal lunas → koreksi");
  await as(null);
  let rpcDenied = false;
  try {
    await db.query(`select mark_booking_paid($1, true)`, [bk]);
  } catch {
    rpcDenied = true;
  }
  console.assert(rpcDenied, "mark_booking_paid tanpa izin harus ditolak");

  // A-2: order shop terverifikasi → Penjualan merchandise; refund → koreksi.
  const ord = (await one(`insert into orders (member_id, subtotal, total, recipient_name, recipient_phone, shipping_address) values ($1, 220000, 220000, 'Mira', '0812', 'Jl. A') returning id`, [u])).id;
  await db.query(`update orders set payment_status = 'paid', paid_at = now() where id = $1`, [ord]);
  console.assert((await net("shop_order_verified")) === 220000, "A-2 order lunas");
  await db.query(`update orders set payment_status = 'refunded' where id = $1`, [ord]);
  console.assert((await net("shop_order_verified")) === 0, "A-3 refund order → koreksi");

  // Activity sebelum go-live tapi peserta baru diimpor / dilunasi sesudahnya → tidak dicatat (§14 7b).
  const oldSid = (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at, points_per_attendance)
     values ('fin-old', 'Mabar Lama', 'weekly-mabar', $1, '2019-12-28T16:00:00+07:00', '2019-12-28T19:00:00+07:00', 20, 'completed', '2019-12-28T19:00:00+07:00', 50) returning id`,
    [venueId],
  )).id;
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount, paid_at) values ($1, 'Bayar Lama', 'F4', 'bayarlama', 99000, '2019-12-28T10:00:00+07:00')`, [oldSid]);
  console.assert((await net("kuyy_import")) === 0, "activity sebelum go-live tidak dicatat");
  await db.query(`update session_participants set paid_at = null where kuy_reg_no = 'F4'`);
  console.assert((await one(`select paid_at from session_participants where kuy_reg_no = 'F4'`)).paid_at !== null, "import ulang tanpa waktu bayar tidak boleh menghapus paid_at");
  // Sebelum go-live: tidak ada transaksi otomatis.
  await db.exec(`update finance_settings set go_live_date = '2999-01-01'`);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Peserta Lama', 'F3', 'pesertalama', 99000)`, [sid]);
  console.assert((await net("kuyy_import")) === 0, "data sebelum go-live tidak dicatat otomatis");

  // RLS: Pencatat keuangan boleh catat pengeluaran sendiri, tidak boleh modal pemilik / pos neraca.
  const rec = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Pencatat', 'pencatat@soslay.test', 'active' from roles where name = 'Pencatat keuangan'`, [rec]);
  const bank = (await one(`select id from finance_accounts where system_key = 'bank_main'`)).id;
  const court = (await one(`select id from finance_categories where name = 'Sewa lapangan'`)).id;
  await db.exec(`grant usage on schema public to authenticated; grant select, insert, update on finance_transactions, finance_balance_items, finance_accounts, finance_categories to authenticated;`);
  await db.exec(`set role authenticated`);
  await as(rec);
  await db.query(`insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, created_by) values ('expense', current_date, current_date, 500000, $1, $2, 'Sewa', $3)`, [court, bank, rec]);
  let denied = false;
  try {
    await db.query(`insert into finance_transactions (type, date, recognized_on, amount, account_id, description, created_by) values ('owner_withdrawal', current_date, current_date, 1000000, $1, 'Prive', $2)`, [bank, rec]);
  } catch {
    denied = true;
  }
  console.assert(denied, "Pencatat bisa mencatat penarikan pemilik!");
  const items = await one(`select count(*)::int n from finance_balance_items`);
  const visible = await one(`select count(*)::int n from finance_transactions`);
  console.assert(items.n === 0 && visible.n > 0, "Pencatat: transaksi terlihat, pos neraca tidak");
  await as(null);
  await db.exec(`reset role`);

  // Keterisian sesi (session_fill_counts): daftar peserta (termasuk ghost) + booking aktif di luar daftar itu;
  // batal / waitlist tidak dihitung. Angka sama untuk semua role staf, kosong untuk non-staf.
  const fillSid = (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('fill-1', 'Mabar Isi', 'weekly-mabar', $1, now() + interval '3 days', now() + interval '3 days 2 hours', 10, 'published', 50) returning id`,
    [venueId],
  )).id;
  const mk = async (name) => {
    const id = (await one(`insert into auth.users default values returning id`)).id;
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${name.replace(/\s/g, "").toLowerCase()}@fill.test`]);
    return id;
  };
  const [kuyMember, webMember, cancelled, waiting] = [await mk("Isi Kuy"), await mk("Isi Web"), await mk("Isi Batal"), await mk("Isi Tunggu")];
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username) values ($1, 'Ghost Satu', 'G1', 'ghost1'), ($1, 'Ghost Dua', 'G2', 'ghost2')`, [fillSid]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, member_id) values ($1, 'Isi Kuy', 'G3', 'isikuy', $2)`, [fillSid, kuyMember]);
  await db.query(`insert into bookings (session_id, member_id, source, status) values ($1, $2, 'website', 'registered'), ($1, $3, 'website', 'cancelled'), ($1, $4, 'website', 'waitlisted')`, [fillSid, webMember, cancelled, waiting]);
  const fillAs = async (who) => {
    await db.exec(`set role authenticated`);
    await as(who);
    const row = await one(`select filled from session_fill_counts() where session_id = $1`, [fillSid]);
    await as(null);
    await db.exec(`reset role`);
    return row?.filled ?? null;
  };
  await db.exec(`grant execute on function session_fill_counts() to authenticated`);
  console.assert((await fillAs(fsa)) === 4, `keterisian Super Admin ${await fillAs(fsa)} (harus 4: 2 ghost + 1 member Kuyy + 1 booking website)`);
  console.assert((await fillAs(rec)) === 4, "keterisian Pencatat keuangan beda dengan Super Admin");
  console.assert((await fillAs(webMember)) === null, "non-staf bisa membaca keterisian sesi");
  console.log("✓ keuangan: import Kuyy, Tandai Lunas & order shop tercatat otomatis (+ koreksi), go-live dihormati, RLS Pencatat keuangan");
}

// Tennis Escape = Trip (BR-22): pembeli paket otomatis terdaftar di semua activity trip; tautkan / lepas
// activity & batal paket ikut menyesuaikan; pembayaran paket → Keuangan (A-10), dibatalkan → koreksi.
{
  await as(null);
  await db.exec(`update finance_settings set go_live_date = '2020-01-01'`);
  const venueId = (await one(`select id from venues limit 1`)).id;
  const trip = (await one(
    `insert into trips (slug, title, starts_on, ends_on, status, price_normal, price_early_bird, early_bird_until, package_quota, min_dp)
     values ('rally-bali', 'Rally in Paradise · Bali', current_date + 10, current_date + 12, 'published', 3500000, 3200000, current_date, 12, 1500000) returning id`,
  )).id;
  const mkSession = async (slug, tripId) => (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance, trip_id)
     values ($1, $1, 'tennis-escape', $2, now() + interval '10 days', now() + interval '10 days 3 hours', 16, 'published', 50, $3) returning id`,
    [slug, venueId, tripId],
  )).id;
  const s1 = await mkSession("trip-a1", trip);
  const s2 = await mkSession("trip-a2", trip);
  const buyer = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Gusde Arimbawa', 'gusde@trip.test')`, [buyer]);
  const bk = (await one(`insert into trip_bookings (trip_id, member_id, full_name) values ($1, $2, 'Gusde Arimbawa') returning id`, [trip, buyer])).id;
  await db.query(`insert into trip_bookings (trip_id, full_name, phone) values ($1, 'Tamu Trip', '81200009999')`, [trip]);
  const tripRows = async (sid) => Number((await one(`select count(*) n from session_participants where session_id = $1 and source = 'trip'`, [sid])).n);
  console.assert((await tripRows(s1)) === 2 && (await tripRows(s2)) === 2, "pembeli paket tidak terdaftar di semua activity trip");
  const memberBooking = await one(`select status::text from bookings where session_id = $1 and member_id = $2`, [s1, buyer]);
  console.assert(memberBooking?.status === "registered", `member paket tidak muncul di My Activities ${JSON.stringify(memberBooking)}`);
  // Activity yang ditautkan belakangan ikut terisi; yang dilepas dikeluarkan (sesi tetap ada).
  const s3 = await mkSession("trip-a3", null);
  await db.query(`update sessions set status = 'draft', visibility = 'public' where id = $1`, [s3]);
  await db.query(`update trips set visibility = 'members' where id = $1`, [trip]);
  await db.query(`update sessions set trip_id = $1 where id = $2`, [trip, s3]);
  console.assert((await tripRows(s3)) === 2, "activity yang ditautkan ke trip tidak terisi pembeli paket");
  const linkedS3 = await one(`select status::text s, visibility::text v from sessions where id = $1`, [s3]);
  console.assert(linkedS3.s === "published" && linkedS3.v === "members", `activity yang ditautkan tidak ikut status/visibilitas trip ${JSON.stringify(linkedS3)}`);
  // Pembeli paket yang juga ada di baris Kuyy: baris Kuyy dihapus ("Hapus semua") → terdaftar lagi lewat paket.
  await db.query(`delete from session_participants where session_id = $1 and member_id = $2`, [s3, buyer]);
  await db.query(`insert into session_participants (session_id, member_id, full_name, kuy_reg_no, kuy_username) values ($1, $2, 'Gusde Arimbawa', 'K-9', 'gusde')`, [s3, buyer]);
  await db.query(`delete from session_participants where session_id = $1 and kuy_reg_no = 'K-9'`, [s3]);
  console.assert((await tripRows(s3)) === 2, "pembeli paket hilang setelah baris Kuyy-nya dihapus");
  await db.query(`update sessions set trip_id = null where id = $1`, [s3]);
  console.assert((await tripRows(s3)) === 0 && (await one(`select count(*)::int n from bookings where session_id = $1 and member_id = $2`, [s3, buyer])).n === 0, "lepas dari trip tidak mengeluarkan peserta paket");
  // Kapasitas: x paket + y satuan.
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username) values ($1, 'Satuan Kuy', 'U1', 'satuan1')`, [s1]);
  const tripAdmin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Trip', 'trip@soslay.test', 'active' from roles where name = 'Super Admin'`, [tripAdmin]);
  await as(tripAdmin);
  const fill = await one(`select filled, trip_filled from session_fill_counts() where session_id = $1`, [s1]);
  await as(null);
  console.assert(fill?.filled === 3 && fill.trip_filled === 2, `kapasitas trip ${JSON.stringify(fill)}`);
  // A-10: DP & pelunasan → Keuangan (terkait trip, termin), dibatalkan → koreksi.
  const bank = (await one(`select id from finance_accounts where system_key = 'bank_main'`)).id;
  const net = async () => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'trip_payment' and deleted_at is null`)).s);
  await db.query(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'dp', 1500000, current_date - 1, $2)`, [bk, bank]);
  const pel = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'settlement', 1700000, current_date, $2) returning id`, [bk, bank])).id;
  const tx = await one(`select trip_id, term, activity_session_id from finance_transactions where source = 'trip_payment' and source_ref like $1`, ['tp:' + pel + ':%']);
  console.assert((await net()) === 3200000 && tx?.trip_id === trip && tx.term === "settlement", `A-10 pembayaran trip ${await net()} ${JSON.stringify(tx)}`);
  // Akun penerima diganti → pindah akun di Keuangan (koreksi di akun lama, pemasukan di akun baru), total tetap.
  const cash = (await one(`select id from finance_accounts where system_key = 'cash'`)).id;
  await db.query(`update trip_payments set account_id = $2 where id = $1`, [pel, cash]);
  const byAcc = async (acc) => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'trip_payment' and account_id = $1 and deleted_at is null`, [acc])).s);
  console.assert((await net()) === 3200000 && (await byAcc(cash)) === 1700000 && (await byAcc(bank)) === 1500000, `A-10 ganti akun ${await byAcc(bank)} / ${await byAcc(cash)}`);
  await db.query(`update trip_payments set voided_at = now(), void_reason = 'salah input' where id = $1`, [pel]);
  console.assert((await net()) === 1500000, "A-10 pembayaran dibatalkan → koreksi");
  // Sync trip (10 Nov): pembayaran sebelum go-live dilewati trigger → Sync mencatatnya sekali, di tanggal terima.
  await db.query(`update finance_settings set go_live_date = current_date + 1 where true`);
  const late = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'installment', 400000, current_date - 60, $2) returning id`, [bk, bank])).id;
  console.assert((await net()) === 1500000, "pembayaran trip sebelum go-live tetap dicatat trigger");
  await as(tripAdmin);
  const preview = (await one(`select finance_resync_trip($1, false) r`, [trip])).r;
  console.assert(preview.new.length === 1 && preview.new[0].amount === 400000 && (await net()) === 1500000, `pratinjau Sync trip menulis / salah ${JSON.stringify(preview)}`);
  const synced = (await one(`select finance_resync_trip($1) r`, [trip])).r;
  const lateTx = await one(`select date::text date, term from finance_transactions where source = 'trip_payment' and source_ref = $1`, ['tp:' + late + ':' + bank]);
  console.assert(synced.changes === 1 && (await net()) === 1900000 && lateTx?.term === "installment" && lateTx.date === (await one(`select (current_date - 60)::text d`)).d, `Sync trip tidak mencatat pembayaran sebelum go-live ${JSON.stringify(synced)} ${await net()} ${JSON.stringify(lateTx)}`);
  console.assert((await one(`select finance_resync_trip($1) r`, [trip])).r.changes === 0 && (await net()) === 1900000, "Sync trip dua kali mencatat dobel");
  // Data berubah sesudah pratinjau dikonfirmasi → dibatalkan, tidak mencatat yang belum dilihat admin.
  const token = (await one(`select finance_resync_trip($1, false) r`, [trip])).r.token;
  await as(null);
  const sneaky = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'installment', 100000, current_date - 50, $2) returning id`, [bk, bank])).id;
  await as(tripAdmin);
  console.assert(await db.query(`select finance_resync_trip($1, true, $2)`, [trip, token]).then(() => false, () => true), "Sync trip mencatat pembayaran yang tidak ada di pratinjau");
  const fresh = (await one(`select finance_resync_trip($1, false) r`, [trip])).r;
  console.assert((await one(`select finance_resync_trip($1, true, $2) r`, [trip, fresh.token])).r.changes === 1, "Sync trip dengan token terbaru gagal");
  await as(null);
  await db.query(`update trip_payments set voided_at = now(), void_reason = 'tes' where id = $1`, [sneaky]);
  console.assert((await net()) === 1900000, "pembatalan sesudah Sync tidak dikoreksi");
  // Fungsi pencatat internal tidak bisa dipanggil langsung lewat RPC (default privileges Supabase).
  for (const fn of ["finance_insert_trip_payment(text, bigint, date, uuid, text, uuid, text)", "finance_sync_auto(text, text, bigint, text, uuid, text, uuid, timestamptz, uuid, text, boolean)", "finance_sync_participant(session_participants, boolean, sessions, finance_settings)"]) {
    for (const role of ["anon", "authenticated"]) {
      console.assert(!(await one(`select has_function_privilege($1, $2, 'execute') ok`, [role, fn])).ok, `${role} bisa memanggil ${fn}`);
    }
  }
  console.assert(!(await one(`select has_function_privilege('anon', 'finance_resync_trip(uuid, boolean, text)', 'execute') ok`)).ok, "anon bisa memanggil finance_resync_trip");
  const { id: outsider } = await one(`insert into auth.users default values returning id`);
  await as(outsider);
  console.assert(await db.query(`select finance_resync_trip($1)`, [trip]).then(() => false, () => true), "member biasa bisa Sync trip");
  await as(null);
  // Akun diganti sesudah Sync (tanggal sebelum go-live) → pindah ke akun baru, tidak hilang.
  await db.query(`update trip_payments set account_id = $2 where id = $1`, [late, cash]);
  console.assert((await net()) === 1900000 && (await byAcc(cash)) === 400000, `ganti akun pembayaran hasil Sync menghilangkan uangnya ${await net()} / ${await byAcc(cash)}`);
  await db.query(`update trip_payments set voided_at = now(), void_reason = 'tes' where id = $1`, [late]);
  console.assert((await net()) === 1500000, "pembayaran hasil Sync dibatalkan tidak dikoreksi");
  // Transaksi otomatis yang dihapus admin (dobel dengan import jurnal) tidak dibuat ulang oleh Sync.
  const dup = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'installment', 250000, current_date - 30, $2) returning id`, [bk, bank])).id;
  await as(tripAdmin);
  await db.query(`select finance_resync_trip($1)`, [trip]);
  await as(null);
  await db.query(`update finance_transactions set deleted_at = now(), deleted_reason = 'dobel import' where source_ref = $1`, ['tp:' + dup + ':' + bank]);
  await as(tripAdmin);
  const again = (await one(`select finance_resync_trip($1) r`, [trip])).r;
  await as(null);
  console.assert(again.changes === 0 && again.skipped_deleted === 1 && (await net()) === 1500000, `Sync trip membuat ulang transaksi yang dihapus ${JSON.stringify(again)}`);
  // Ref akun lama yang tersisa (data lama) dikoreksi oleh Sync.
  await db.query(`select finance_insert_trip_payment($1, 300000, current_date - 20, $2, 'tes', $3, 'installment')`, ['tp:' + dup + ':' + cash, cash, trip]);
  await as(tripAdmin);
  const stale = (await one(`select finance_resync_trip($1) r`, [trip])).r;
  await as(null);
  console.assert(stale.corrections === 1 && (await byAcc(cash)) === 0, `Sync trip tidak mengoreksi ref akun lama ${JSON.stringify(stale)} ${await byAcc(cash)}`);
  await db.query(`update finance_settings set go_live_date = '2020-01-01' where true`);
  // Batal paket → keluar dari semua activity.
  await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [bk]);
  console.assert((await tripRows(s1)) === 1 && (await tripRows(s2)) === 1, "paket dibatalkan masih terdaftar di activity");
  // Rundown disimpan sekaligus; visibilitas Link hanya untuk peserta trip.
  await db.query(`select save_trip_rundown($1, $2::jsonb)`, [trip, JSON.stringify([{ day: "2026-10-17", time_label: "05.30", title: "Penjemputan", location: "Bali", session_id: null }, { day: "2026-10-17", time_label: "07.00", title: "Activity 1", session_id: s1 }])]);
  const rd = await one(`select count(*)::int n, max(sort)::int m from trip_rundown_items where trip_id = $1`, [trip]);
  console.assert(rd.n === 2 && rd.m === 1, `rundown ${JSON.stringify(rd)}`);
  await db.query(`update trips set visibility = 'link' where id = $1`, [trip]);
  // Status & visibilitas trip diteruskan ke activity-nya.
  console.assert((await one(`select count(*)::int n from sessions where trip_id = $1 and visibility::text <> 'link'`, [trip])).n === 0, "visibilitas trip tidak diteruskan ke activity");
  await db.query(`update sessions set status = 'draft' where id = $1`, [s2]);
  await db.query(`update trips set status = 'draft' where id = $1`, [trip]);
  await db.query(`update trips set status = 'published' where id = $1`, [trip]);
  console.assert((await one(`select status::text s from sessions where id = $1`, [s2])).s === "published", "publikasikan trip tidak mempublikasikan activity draft");
  await db.exec(`grant select on trips, trip_bookings, sessions, bookings to anon, authenticated`);
  const visibleTo = async (uid) => {
    await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
    await as(uid);
    const n = (await one(`select count(*)::int n from trips where id = $1`, [trip])).n;
    await as(null);
    await db.exec(`reset role`);
    return n;
  };
  const stranger = (await one(`insert into auth.users default values returning id`)).id;
  console.assert((await visibleTo(null)) === 0 && (await visibleTo(stranger)) === 0, "trip Link terbaca orang luar");
  await db.query(`update trip_bookings set cancelled_at = null where id = $1`, [bk]);
  console.assert((await visibleTo(buyer)) === 1, "trip Link tidak terbaca pembeli paketnya");
  // Daftar akun penerima: tim Activities tanpa akses Keuangan tetap mendapatkannya; orang luar tidak.
  await db.exec(`grant execute on function payment_accounts() to anon`);
  await as(tripAdmin);
  const accs = (await db.query(`select * from payment_accounts()`)).rows.length;
  await as(stranger);
  const leaked = (await db.query(`select * from payment_accounts()`)).rows.length;
  await as(null);
  console.assert(accs > 0 && leaked === 0, `payment_accounts ${accs}/${leaked}`);
  // Arsip → activity yang belum mulai kembali Draft; publikasikan lagi → tampil lagi.
  await db.query(`update trips set status = 'cancelled' where id = $1`, [trip]);
  console.assert((await one(`select count(*)::int n from sessions where trip_id = $1 and status = 'published'`, [trip])).n === 0, "arsip trip tidak menyembunyikan activity");
  await db.query(`update trips set status = 'published' where id = $1`, [trip]);
  console.assert((await one(`select count(*)::int n from sessions where trip_id = $1 and status = 'draft'`, [trip])).n === 0, "publikasikan lagi tidak menampilkan activity");
  await db.exec(`update finance_settings set go_live_date = '2026-12-01'`);
  console.log("✓ trip: pembeli paket terdaftar di semua activity (tautkan / lepas / batal), kapasitas paket, pembayaran → Keuangan + koreksi, ikut status trip, pulih setelah baris Kuyy dihapus, arsip, akun penerima");
}

// Perbaikan code review Trip & Keuangan (20261106050000): booking jalur lain tidak ikut terhapus, tidak
// dobel dengan baris Kuyy, kuota & arsip, tidak bayar lebih, pembayaran tidak bisa dihapus, simpan trip
// atomik, koreksi di akun yang menerima uang, otomatis dimatikan tetap dikoreksi.
{
  await as(null);
  await db.exec(`update finance_settings set go_live_date = '2020-01-01'`);
  const rejects = async (sql, params, hint) => {
    try {
      await db.query(sql, params);
      return false;
    } catch (error) {
      return !hint || error.hint === hint;
    }
  };
  const venueId = (await one(`select id from venues limit 1`)).id;
  const trip = (await one(
    `insert into trips (slug, title, starts_on, ends_on, status, price_normal, package_quota) values ('fix-trip', 'Fix Trip', current_date + 10, current_date + 11, 'published', 1000000, 2) returning id`,
  )).id;
  const sid = (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance, trip_id)
     values ('fix-a1', 'Fix A1', 'tennis-escape', $1, now() + interval '10 days', now() + interval '10 days 2 hours', 16, 'published', 50, $2) returning id`,
    [venueId, trip],
  )).id;
  const mkMember = async (name) => {
    const id = (await one(`insert into auth.users default values returning id`)).id;
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${id.slice(0, 8)}@fix.test`]);
    return id;
  };
  const rows = async (m) => (await db.query(`select source from session_participants where session_id = $1 and member_id = $2`, [sid, m])).rows.map((r) => r.source);
  const bookingOf = async (m) => (await one(`select source::text, status::text from bookings where session_id = $1 and member_id = $2`, [sid, m])) ?? null;

  // 1. Booking admin yang sudah ada tetap ada saat paket dibatalkan.
  const adm = await mkMember("Admin Booked");
  await db.query(`insert into bookings (session_id, member_id, source, amount) values ($1, $2, 'admin', 150000)`, [sid, adm]);
  const admBk = (await one(`insert into trip_bookings (trip_id, member_id, full_name) values ($1, $2, 'Admin Booked') returning id`, [trip, adm])).id;
  await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [admBk]);
  console.assert((await bookingOf(adm))?.source === "admin", `batal paket menghapus booking admin ${JSON.stringify(await bookingOf(adm))}`);

  // 2. Baris Kuyy masuk sesudah paket → baris paket dilepas (tidak dobel); baris Kuyy dihapus → paket lagi.
  const kuy = await mkMember("Kuy Later");
  const kuyBk = (await one(`insert into trip_bookings (trip_id, member_id, full_name) values ($1, $2, 'Kuy Later') returning id`, [trip, kuy])).id;
  const points = async (m) => Number((await one(`select points_balance from member_stats where member_id = $1`, [m]))?.points_balance ?? 0);
  await db.query(`update session_participants set checked_in_at = now() where session_id = $1 and member_id = $2`, [sid, kuy]);
  const pointsBefore = await points(kuy);
  await db.query(`insert into session_participants (session_id, member_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, $2, 'Kuy Later', 'K-77', 'kuylater', 150000)`, [sid, kuy]);
  const afterKuy = await rows(kuy);
  const keptCheckIn = (await one(`select checked_in_at is not null c from session_participants where session_id = $1 and kuy_reg_no = 'K-77'`, [sid])).c;
  console.assert(afterKuy.length === 1 && afterKuy[0] === "kuy" && keptCheckIn, `pembeli paket dobel dengan baris Kuyy ${JSON.stringify(afterKuy)}`);
  console.assert((await bookingOf(kuy))?.status === "attended" && pointsBefore > 0 && (await points(kuy)) === pointsBefore, `check-in pindah ke baris Kuyy: booking ${JSON.stringify(await bookingOf(kuy))}, poin ${pointsBefore} → ${await points(kuy)}`);
  await db.query(`delete from session_participants where session_id = $1 and kuy_reg_no = 'K-77'`, [sid]);
  console.assert(JSON.stringify(await rows(kuy)) === '["trip"]', "baris Kuyy dihapus → tidak kembali lewat paket");
  // Booking sempat dapat nominal dari baris Kuyy; paket dibatalkan → booking ikut keluar (tidak yatim).
  const kuy2 = await mkMember("Kuy Nominal");
  const kuy2Bk = (await one(`insert into trip_bookings (trip_id, member_id, full_name) values ($1, $2, 'Kuy Nominal') returning id`, [trip, kuy2])).id;
  await db.query(`insert into session_participants (session_id, member_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, $2, 'Kuy Nominal', 'K-78', 'kuynominal', 150000)`, [sid, kuy2]);
  await db.query(`delete from session_participants where session_id = $1 and kuy_reg_no = 'K-78'`, [sid]);
  await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [kuy2Bk]);
  console.assert((await bookingOf(kuy2)) === null && (await rows(kuy2)).length === 0, `booking yatim setelah paket dibatalkan ${JSON.stringify(await bookingOf(kuy2))}`);

  // 3. Kuota paket (2 aktif) & trip diarsipkan.
  const third = await mkMember("Ketiga");
  console.assert(await rejects(`insert into trip_bookings (trip_id, member_id, full_name) values ($1, $2, 'Ketiga')`, [trip, third], "trip_quota") === false, "kuota: slot ke-2 harus diterima");
  console.assert(await rejects(`insert into trip_bookings (trip_id, full_name) values ($1, 'Tamu Lebih')`, [trip], "trip_quota"), "kuota paket terlewati");
  console.assert(await rejects(`update trip_bookings set cancelled_at = null where id = $1`, [admBk], "trip_quota"), "aktifkan lagi melewati kuota");
  await db.query(`update trips set status = 'cancelled' where id = $1`, [trip]);
  await db.query(`update trip_bookings set cancelled_at = now() where trip_id = $1 and member_id = $2`, [trip, third]);
  console.assert(await rejects(`insert into trip_bookings (trip_id, full_name) values ($1, 'Tamu Arsip')`, [trip], "trip_archived"), "trip diarsipkan masih menerima peserta");
  await db.query(`update trips set status = 'published' where id = $1`, [trip]);

  // 4. Tidak bayar lebih dari harga paket; 5. pembayaran aktif / trip-nya tidak bisa dihapus.
  const bank = (await one(`select id from finance_accounts where system_key = 'bank_main'`)).id;
  const pay = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'dp', 600000, current_date, $2) returning id`, [kuyBk, bank])).id;
  console.assert(await rejects(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'settlement', 600000, current_date, $2)`, [kuyBk, bank], "trip_overpaid"), "pembayaran melebihi harga paket diterima");
  console.assert(await rejects(`delete from trip_payments where id = $1`, [pay], "trip_payment_active"), "pembayaran aktif bisa dihapus");
  console.assert(await rejects(`delete from trips where id = $1`, [trip], "trip_payment_active"), "hapus trip menghapus pembayaran aktif");
  const tripNet = Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'trip_payment' and source_ref like $1`, [`tp:${pay}:%`])).s);
  console.assert(tripNet === 600000, `Keuangan trip berubah setelah hapus ditolak ${tripNet}`);

  // 6. save_trip atomik: activity kedua gagal (venue tidak ada) → info trip & activity pertama tidak berubah.
  const tripAdmin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Fix', 'fix@soslay.test', 'active' from roles where name = 'Super Admin'`, [tripAdmin]);
  await as(tripAdmin);
  const info = { title: "Fix Trip (ubah)", description: "", area: "", starts_on: "2030-01-01", ends_on: "2030-01-02", status: "published", visibility: "public", show_on_homepage: false, show_rundown: true, price_normal: 1000000, package_quota: 2, min_dp: 0, inclusions: ["Hotel"] };
  const act = (extra) => ({ title: "Baru", venue_id: venueId, starts_at: "2030-01-01T01:00:00Z", ends_at: "2030-01-01T03:00:00Z", capacity: 16, sold_single: false, price: 0, type_slug: "tennis-escape", trip_order: 1, ...extra });
  const failed = await rejects(`select save_trip($1, $2::jsonb, $3::jsonb, '[]'::jsonb)`, [trip, JSON.stringify(info), JSON.stringify([
    act({ id: sid, key: "a", title: "Fix A1 (ubah)" }),
    act({ key: "b", slug: "fix-b", venue_id: "00000000-0000-0000-0000-000000000000" }),
  ])]);
  const untouched = await one(`select t.title, s.title st from trips t join sessions s on s.trip_id = t.id where t.id = $1`, [trip]);
  console.assert(failed && untouched?.title === "Fix Trip" && untouched.st === "Fix A1", `save_trip tidak atomik ${JSON.stringify(untouched)}`);
  const newTrip = (await one(`select save_trip(null, $1::jsonb, $2::jsonb, $3::jsonb) id`, [
    JSON.stringify({ ...info, slug: "fix-new", create_key: "trip-form-1" }),
    JSON.stringify([act({ key: "n1", slug: "fix-n1" })]),
    JSON.stringify([{ day: "2030-01-01", time_label: "08.00", title: "Main", location: "", activity_key: "n1" }]),
  ])).id;
  const made = await one(`select (select count(*)::int from sessions where trip_id = $1) n, (select count(*)::int from trip_rundown_items r join sessions s on s.id = r.session_id where r.trip_id = $1) linked, (select created_by from trips where id = $1) by`, [newTrip]);
  console.assert(made.n === 1 && made.linked === 1 && made.by === tripAdmin, `save_trip baru ${JSON.stringify(made)}`);
  // Simpan ulang dari form yang sama tanpa id (respons pertama hilang / tab kedua) → trip & activity yang sama, tidak kembar.
  const again = (await one(`select save_trip(null, $1::jsonb, $2::jsonb, '[]'::jsonb) id`, [
    JSON.stringify({ ...info, slug: "fix-new-2", create_key: "trip-form-1" }),
    JSON.stringify([act({ key: "n1", slug: "fix-n1-2", title: "Baru (ubah)" }), act({ key: "n2", slug: "fix-n2", trip_order: 2 })]),
  ])).id;
  const twins = await one(`select (select count(*)::int from trips where create_key = 'trip-form-1') trips, (select count(*)::int from sessions where trip_id = $1) n, (select count(*)::int from sessions where slug like 'fix-n1%') n1, (select title from sessions where trip_key = 'n1') t`, [newTrip]);
  console.assert(again === newTrip && twins.trips === 1 && twins.n === 2 && twins.n1 === 1 && twins.t === "Baru (ubah)", `simpan trip ulang membuat kembar ${JSON.stringify(twins)}`);
  // Form basi: tab A & B memuat versi yang sama; A menambah activity n3 lalu simpan; B (tidak kenal n3) simpan →
  // ditolak (trip_stale), n3 tetap di trip & judul trip tidak tertimpa. Versi terbaru → diterima.
  const ver = async () => (await one(`select form_version v from trips where id = $1`, [newTrip])).v;
  const loaded = await ver();
  const both = [act({ id: (await one(`select id from sessions where trip_key = 'n1'`)).id, key: "n1" }), act({ key: "n2", trip_order: 2 })];
  await db.query(`select save_trip($1, $2::jsonb, $3::jsonb, '[]'::jsonb)`, [newTrip, JSON.stringify({ ...info, title: "Tab A", form_version: loaded }), JSON.stringify([...both, act({ key: "n3", slug: "fix-n3", trip_order: 3 })])]);
  const staleRejected = await rejects(`select save_trip($1, $2::jsonb, $3::jsonb, '[]'::jsonb)`, [newTrip, JSON.stringify({ ...info, title: "Tab B", form_version: loaded }), JSON.stringify(both)], "trip_stale");
  const afterStale = await one(`select title, (select count(*)::int from sessions where trip_id = $1) n, (select trip_id from sessions where trip_key = 'n3') n3 from trips where id = $1`, [newTrip]);
  console.assert(staleRejected && afterStale.title === "Tab A" && afterStale.n === 3 && afterStale.n3 === newTrip, `simpan dari form basi melepas activity / menimpa trip ${JSON.stringify(afterStale)}`);
  await db.query(`select save_trip($1, $2::jsonb, $3::jsonb, '[]'::jsonb)`, [newTrip, JSON.stringify({ ...info, title: "Tab B (muat ulang)", form_version: await ver() }), JSON.stringify(both)]);
  const fresh = await one(`select title, (select count(*)::int from sessions where trip_id = $1) n from trips where id = $1`, [newTrip]);
  console.assert(fresh.title === "Tab B (muat ulang)" && fresh.n === 2, `simpan dengan versi terbaru ditolak ${JSON.stringify(fresh)}`);
  // Perubahan baris trip di luar editor (mis. arsip / tampil di homepage) tidak membuat form basi.
  const v2 = await ver();
  await db.query(`update trips set show_on_homepage = not show_on_homepage where id = $1`, [newTrip]);
  const notStale = await db.query(`select save_trip($1, $2::jsonb, $3::jsonb, '[]'::jsonb)`, [newTrip, JSON.stringify({ ...info, title: "Sesudah arsip", form_version: v2 }), JSON.stringify(both)]).then(() => true, () => false);
  console.assert(notStale, "perubahan trip di luar editor tidak dianggap form basi");
  // Peserta paket dibatalkan → pembayarannya keluar dari Keuangan & tidak dicatat lagi oleh Sync; diaktifkan lagi → tercatat lagi.
  const cxl = (await one(`insert into trip_bookings (trip_id, full_name) values ($1, 'Batal Paket') returning id`, [newTrip])).id;
  const cxlPay = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'dp', 500000, current_date, $2) returning id`, [cxl, bank])).id;
  const cxlNet = async () => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'trip_payment' and source_ref like $1 and deleted_at is null`, [`tp:${cxlPay}:%`])).s);
  const cxlBefore = await cxlNet();
  await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [cxl]);
  const cxlAfter = await cxlNet();
  const cxlSync = (await one(`select finance_resync_trip($1) r`, [newTrip])).r;
  console.assert(cxlBefore === 500000 && cxlAfter === 0 && (await cxlNet()) === 0 && !cxlSync.new.some((x) => x.name === "Batal Paket"), `peserta dibatalkan tetap di Keuangan / dicatat Sync ${cxlBefore} → ${cxlAfter} ${JSON.stringify(cxlSync)}`);
  // "Keluarkan" = dihapus: tidak ada baris yang tampil (bukan pemasukan + baris koreksi).
  const cxlVisible = (await one(`select count(*)::int n from finance_transactions where source_ref like $1 and deleted_at is null`, [`tp:${cxlPay}:%`])).n;
  console.assert(cxlVisible === 0, `peserta dibatalkan masih tampil di Keuangan (${cxlVisible} baris)`);
  await db.query(`update trip_bookings set cancelled_at = null where id = $1`, [cxl]);
  console.assert((await cxlNet()) === 500000, `peserta diaktifkan lagi: pembayaran tidak tercatat lagi (${await cxlNet()})`);
  await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [cxl]);
  // Diaktifkan lagi: transaksi yang dihapus karena pembatalan dipulihkan apa adanya (tanggal asli, tanpa baris
  // baru); transaksi yang pernah dihapus admin (dobel dengan import jurnal) tidak dibuat ulang.
  {
    const goLive = (await one(`select go_live_date::text d from finance_settings`)).d;
    await db.exec(`update finance_settings set go_live_date = '2020-01-01' where true`);
    await db.query(`update trips set package_quota = package_quota + 10 where id = $1`, [newTrip]); // peserta uji tambahan
    const old = (await one(`insert into trip_bookings (trip_id, full_name) values ($1, 'Aktif Lagi') returning id`, [newTrip])).id;
    const oldPay = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'dp', 300000, current_date - 40, $2) returning id`, [old, bank])).id;
    await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [old]);
    await db.query(`update trip_bookings set cancelled_at = null where id = $1`, [old]);
    const back = await one(`select count(*)::int n, min(date)::text d, (select (current_date - 40)::text) received, coalesce(sum(amount), 0)::int net from finance_transactions where source_ref like $1 and deleted_at is null`, [`tp:${oldPay}:%`]);
    console.assert(back.n === 1 && back.net === 300000 && back.d === back.received, `aktif lagi: transaksi tidak dipulihkan apa adanya ${JSON.stringify(back)}`);
    const gone = (await one(`insert into trip_bookings (trip_id, full_name) values ($1, 'Pernah Dihapus') returning id`, [newTrip])).id;
    const gonePay = (await one(`insert into trip_payments (booking_id, kind, amount, received_on, account_id) values ($1, 'dp', 200000, current_date, $2) returning id`, [gone, bank])).id;
    await db.query(`update finance_transactions set deleted_at = now() where source_ref like $1`, [`tp:${gonePay}:%`]);
    await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [gone]);
    await db.query(`update trip_bookings set cancelled_at = null where id = $1`, [gone]);
    const goneNet = Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source_ref like $1 and deleted_at is null`, [`tp:${gonePay}:%`])).s);
    console.assert(goneNet === 0, `aktif lagi membuat ulang transaksi yang dihapus admin (${goneNet})`);
    for (const b of [old, gone]) await db.query(`update trip_bookings set cancelled_at = now() where id = $1`, [b]);
    await db.query(`update trips set package_quota = package_quota - 10 where id = $1`, [newTrip]);
    await db.query(`update finance_settings set go_live_date = $1 where true`, [goLive]);
  }

  // 7. Tandai Lunas, akun default diganti, lalu batal lunas → koreksi di akun lama (BCA), bukan akun baru.
  const cash = (await one(`select id from finance_accounts where system_key = 'cash'`)).id;
  const payer = await mkMember("Payer Pindah");
  const bk = (await one(`insert into bookings (session_id, member_id, source, amount) values ($1, $2, 'admin', 200000) returning id`, [sid, payer])).id;
  const byAcc = async (acc) => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'ticket_manual_paid' and source_ref = $1 and account_id = $2 and deleted_at is null`, ['bk:' + bk, acc])).s);
  await db.query(`select mark_booking_paid($1, true)`, [bk]);
  await db.exec(`update finance_settings set manual_paid_account_id = '${cash}'`);
  await db.query(`select mark_booking_paid($1, false)`, [bk]);
  console.assert((await byAcc(bank)) === 0 && (await byAcc(cash)) === 0, `koreksi batal lunas di akun salah: BCA ${await byAcc(bank)} / Kas ${await byAcc(cash)}`);
  // 8. Pencatatan otomatis dimatikan: pemasukan baru ditahan, tapi yang sudah tercatat tetap dikoreksi.
  await db.query(`select mark_booking_paid($1, true)`, [bk]);
  await db.exec(`update finance_settings set auto_manual_paid = false`);
  await db.query(`select mark_booking_paid($1, false)`, [bk]);
  console.assert((await byAcc(cash)) === 0, "batal lunas tidak dikoreksi saat pencatatan otomatis dimatikan");
  await db.query(`select mark_booking_paid($1, true)`, [bk]);
  console.assert((await byAcc(cash)) === 0, "pencatatan otomatis dimatikan tetap mencatat pemasukan baru");
  // Akun default dikosongkan sesudah tercatat → batal lunas tetap dikoreksi di akun yang menerima uangnya.
  await db.exec(`update finance_settings set auto_manual_paid = true`);
  await db.query(`select mark_booking_paid($1, true)`, [bk]);
  await db.exec(`update finance_settings set manual_paid_account_id = null`);
  await db.query(`select mark_booking_paid($1, false)`, [bk]);
  console.assert((await byAcc(cash)) === 0, `akun default kosong: batal lunas tidak dikoreksi (Kas ${await byAcc(cash)})`);
  await db.exec(`update finance_settings set auto_manual_paid = true, manual_paid_account_id = '${bank}', go_live_date = '2026-12-01'`);
  await as(null);
  console.log("✓ perbaikan review: booking jalur lain aman, tanpa dobel Kuyy, kuota & arsip paket, tidak bayar lebih, pembayaran tidak terhapus, save_trip atomik & tolak form basi, peserta batal keluar dari Keuangan, koreksi di akun asal, otomatis mati tetap dikoreksi");

  // ── Peserta tambahan admin: "Ubah pembayaran" ikut aturan Keuangan seperti baris Kuyy ──
  {
    await db.exec(`update finance_settings set go_live_date = '2020-01-01'`);
    const venue = (await one(`select id from venues limit 1`)).id;
    const sess = (await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status) values ('adm-pay', 'Admin bayar', 'weekly-mabar', $1, now() - interval '1 day', now() - interval '20 hours', 20, 'completed') returning id`,
      [venue],
    )).id;
    const ref = async (r) => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source_ref = $1 and deleted_at is null`, ['sp:' + r])).s);
    const adm = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, source) values ($1, 'Tamu Admin', 'ADM-1', 'admin') returning id`, [sess])).id;
    console.assert((await ref(adm)) === 0, "peserta admin baru (Rp0) tidak tercatat");
    await db.query(`update session_participants set amount = 200000, payment_status = 'paid', payment_channel = 'manual' where id = $1`, [adm]);
    console.assert((await ref(adm)) === 200000, `peserta admin diubah lunas Rp200.000 → tercatat (${await ref(adm)})`);
    await db.query(`update session_participants set payment_status = 'pending' where id = $1`, [adm]);
    console.assert((await ref(adm)) === 0, "peserta admin jadi menunggu → koreksi");
    // Tamu Kuyy diganti orangnya (nama/no. HP diubah admin) → import ulang file Kuyy tidak menimpanya;
    // keterangan transaksi Keuangan ikut nama baru.
    const kuy = (await one(`insert into session_participants (session_id, full_name, phone, kuy_reg_no, kuy_username, amount) values ($1, 'Tuesdy A', '81111', 'K1', 'buyer1', 230000) returning id`, [sess])).id;
    console.assert((await ref(kuy)) === 230000, "baris Kuyy lunas tercatat");
    await db.query(`update session_participants set full_name = 'Sakinabila', phone = '82222', details_edited_at = now() where id = $1`, [kuy]);
    const desc = await one(`select description from finance_transactions where source_ref = $1 and amount > 0`, ['sp:' + kuy]);
    console.assert(desc.description.includes("Sakinabila") && !desc.description.includes("Tuesdy"), `keterangan Keuangan ikut nama baru (${desc.description})`);
    // Nama yang mirip awalan keterangan ("Kuyy") → hanya bagian nama di akhir yang diganti.
    // Tiap editan admin punya waktu baru (jam PGlite terlalu kasar untuk dua perintah beruntun → waktu eksplisit).
    await db.query(`update session_participants set full_name = 'Kuyy', details_edited_at = now() + interval '1 minute' where id = $1`, [kuy]);
    await db.query(`update session_participants set full_name = 'Sakinabila', details_edited_at = now() + interval '2 minutes' where id = $1`, [kuy]);
    const desc2 = await one(`select description from finance_transactions where source_ref = $1 and amount > 0`, ['sp:' + kuy]);
    console.assert(desc2.description === "Tiket Kuyy · Sakinabila", `ganti nama tidak merusak awalan keterangan (${desc2.description})`);
    await db.query(`update session_participants set full_name = 'Tuesdy A', phone = '81111' where id = $1`, [kuy]); // import ulang
    const after = await one(`select full_name, phone from session_participants where id = $1`, [kuy]);
    console.assert(after.full_name === "Sakinabila" && after.phone === "82222", `import ulang tidak menimpa nama/no. HP yang diubah admin (${JSON.stringify(after)})`);
    await db.exec(`update finance_settings set go_live_date = '2026-12-01'`);
    console.log("✓ peserta tambahan admin: ubah nominal / status / via → Keuangan + koreksi; nama tamu yang diubah tahan import ulang");

    // Jumlah ronde dikurangi → line-up ronde yang tidak ada lagi ikut terhapus; yang sudah ada skornya menolak.
    const ln = (await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, round_count, court_count)
       values ('ln-trim', 'Trim', 'weekly-mabar', $1, now() + interval '1 day', now() + interval '1 day 3 hours', 20, 'published', 'americano', 9, 1) returning id`,
      [venue],
    )).id;
    const pl = [];
    for (let i = 1; i <= 4; i++) pl.push((await one(`insert into session_participants (session_id, full_name, kuy_reg_no, source) values ($1, $2, $3, 'admin') returning id`, [ln, `P${i}`, `L${i}`])).id);
    for (let r = 1; r <= 9; r++) await db.query(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2) values ($1, $2, 1, $3, $4, $5, $6)`, [ln, r, ...pl]);
    await db.query(`update sessions set round_count = 6 where id = $1`, [ln]);
    const rejects = (sql, hint) => db.query(sql, [ln]).then(() => false, (e) => e.hint === hint);
    const left = await one(`select max(round_no)::int r, count(*)::int n from session_matches where session_id = $1`, [ln]);
    console.assert(left.r === 6 && left.n === 6, `ronde dikurangi 9 → 6: line-up R7–R9 terhapus (${JSON.stringify(left)})`);
    await db.query(`update session_matches set score_a = 21, score_b = 15 where session_id = $1 and round_no = 5`, [ln]);
    console.assert(await rejects(`update sessions set round_count = 4 where id = $1`, "lineup_scored"), "ronde yang sudah ada skornya tidak boleh dibuang");
    // Ronde yang sedang dimainkan (belum ada skor) juga tidak boleh dibuang.
    await db.query(`update sessions set started_rounds = '{6}', current_round = 6 where id = $1`, [ln]);
    console.assert(await rejects(`update sessions set round_count = 5 where id = $1`, "lineup_started"), "ronde yang sudah dimulai tidak boleh dibuang");
    // Court dikurangi saat ronde yang memakai court itu sudah dimulai → ditolak.
    await db.query(`update sessions set court_count = 2 where id = $1`, [ln]);
    const pl2 = [];
    for (let i = 5; i <= 8; i++) pl2.push((await one(`insert into session_participants (session_id, full_name, kuy_reg_no, source) values ($1, $2, $3, 'admin') returning id`, [ln, `P${i}`, `L${i}`])).id);
    await db.query(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2) values ($1, 6, 2, $2, $3, $4, $5)`, [ln, ...pl2]);
    console.assert(await rejects(`update sessions set court_count = 1 where id = $1`, "lineup_started"), "court yang dipakai di ronde berjalan tidak boleh dibuang");
    console.log("✓ jumlah ronde / court dikurangi → line-up di luar format terhapus (yang sudah ada skornya ditolak)");
  }
}

// Peringkat juara: total poin / jumlah menang sama → selisih skor menentukan (yang lebih produktif di atas).
{
  await as(null);
  const members = [];
  for (let i = 1; i <= 8; i++) {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, `Rank ${i}`, `rank${i}@mail.com`]);
    members.push(id);
  }
  // Satu ronde, 2 court, 8 member: court 1 = member 1–4, court 2 = member 5–8. Hasil: bonus juara member 1 & 5.
  const podium = async (title, mode, [[a1, b1], [a2, b2]]) => {
    const s = (await one(
      `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, leaderboard_mode, court_count, round_count)
       values ($1, $1, 'weekly-mabar', $2, now() - interval '3 hours', now() - interval '1 hour', 20, 'published', 'americano', $3, 2, 1) returning id`,
      [title, venue, mode],
    )).id;
    const { rows } = await db.query(
      `insert into session_participants (session_id, full_name, kuy_reg_no, source, member_id)
       select $1, 'Rank ' || i, $2 || i, 'admin', m from unnest($3::uuid[]) with ordinality as t(m, i) order by i returning id`,
      [s, title, members],
    );
    await db.query(
      `insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2, score_a, score_b) values ($1, 1, 1, $2, $3, $4, $5, $10, $11), ($1, 1, 2, $6, $7, $8, $9, $12, $13)`,
      [s, ...rows.map((r) => r.id), a1, b1, a2, b2],
    );
    await db.query(`select finish_session($1, null, now())`, [s]);
    const bonus = async (m) => (await one(`select coalesce(sum(delta), 0)::int d from points_ledger where member_id = $1 and note = 'Bonus juara #' || $3 || ' · ' || $2`, [m, title, m === members[0] ? 1 : 3])).d;
    return [await bonus(members[0]), await bonus(members[4])];
  };
  // Point: 48–10 (selisih +38) vs 48–40 (selisih +8) → sama-sama 48 poin.
  const [first, third] = await podium("rank-diff", "points", [[48, 10], [48, 40]]);
  console.assert(first === 100 && third === 50, `poin sama 48: selisih +38 juara 1 (+${first}), selisih +8 juara 3 (+${third})`);
  // Win: 21–5 (selisih +16, 21 poin) vs 30–25 (selisih +5, 30 poin) → menang sama, selisih menang atas poin.
  const [winFirst, winThird] = await podium("rank-diff-win", "wins", [[21, 5], [30, 25]]);
  console.assert(winFirst === 100 && winThird === 50, `menang sama: selisih +16 juara 1 (+${winFirst}), selisih +5 juara 3 (+${winThird})`);
  console.log("✓ peringkat juara: total poin / jumlah menang sama → selisih skor menentukan");

  // Koreksi hasil setelah sesi berakhir: line-up & skor diganti admin → bonus juara dihitung ulang lewat
  // baris koreksi (bonus lama tidak dihapus).
  const fixer = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Koreksi', 'koreksi@soslay.test', 'active' from roles where name = 'Super Admin'`, [fixer]);
  const fails = (sql, params) => db.query(sql, params).then(() => false, () => true);
  const total = async (m, s) => (await one(`select coalesce(sum(delta), 0)::int d from points_ledger where member_id = $1 and session_id = $2`, [m, s])).d;
  await podium("koreksi", "points", [[48, 10], [48, 40]]);
  const ks = (await one(`select id from sessions where slug = 'koreksi'`)).id;
  console.assert((await total(members[0], ks)) === 100 && (await total(members[4], ks)) === 50, "bonus juara dari finish_session ditandai session_id");
  const parts = (await db.query(`select id from session_participants where session_id = $1 order by kuy_reg_no`, [ks])).rows.map((r) => r.id);
  // Court 2 dikoreksi 48–5 (selisih +43) → member 5 & 6 juara 1, member 1 & 2 turun ke #3.
  const lineup = (scoreB2) => JSON.stringify([
    { round_no: 1, court_no: 1, a1: parts[0], a2: parts[1], b1: parts[2], b2: parts[3], score_a: 48, score_b: 10 },
    { round_no: 1, court_no: 2, a1: parts[4], a2: parts[5], b1: parts[6], b2: parts[7], score_a: 48, score_b: scoreB2 },
  ]);
  await as(members[0]);
  console.assert(await fails(`select correct_session_result($1, $2::jsonb)`, [ks, lineup(5)]), "member biasa tidak boleh mengoreksi hasil");
  await as(fixer);
  await db.query(`update sessions set target_points = 58 where id = $1`, [ks]);
  console.assert(await fails(`select correct_session_result($1, $2::jsonb)`, [ks, lineup(5)]), "Americano: total skor koreksi harus = target");
  const dup = JSON.stringify([{ round_no: 1, court_no: 1, a1: parts[0], a2: parts[1], b1: parts[2], b2: parts[3], score_a: 48, score_b: 10 }, { round_no: 1, court_no: 2, a1: parts[0], a2: parts[5], b1: parts[6], b2: parts[7], score_a: null, score_b: null }]);
  console.assert(await fails(`select correct_session_result($1, $2::jsonb)`, [ks, dup]), "pemain main dua kali di satu ronde ditolak");
  await db.query(`update sessions set match_format = 'rotating' where id = $1`, [ks]); // skor bebas
  // Skor court 1 diinput host → tetap tercatat atas nama host setelah koreksi (court 1 tidak berubah).
  await as(null);
  await db.query(`update session_matches set scored_by = $2, scored_at = '2026-01-01T10:00:00Z' where session_id = $1`, [ks, members[0]]);
  await as(fixer);
  const m2 = (await one(`select id from session_matches where session_id = $1 and court_no = 2`, [ks])).id;
  console.assert(await fails(`select save_match_score($1, 48::smallint, 5::smallint)`, [m2]), "sesi berakhir: skor tidak bisa diubah lewat save_match_score (juga Super Admin)");
  const changed = (await one(`select correct_session_result($1, $2::jsonb) n`, [ks, lineup(5)])).n;
  console.assert(changed === 4, `koreksi mengubah bonus 4 member (bukan ${changed})`);
  console.assert((await total(members[0], ks)) === 50 && (await total(members[4], ks)) === 100, `bonus setelah koreksi: #1 lama ${await total(members[0], ks)}, #1 baru ${await total(members[4], ks)}`);
  console.assert((await one(`select count(*)::int n from points_ledger where session_id = $1 and note like 'Bonus juara #%'`, [ks])).n === 4, "bonus lama tidak dihapus");
  console.assert((await one(`select score_b from session_matches where session_id = $1 and court_no = 2`, [ks])).score_b === 5, "skor koreksi tersimpan");
  const scorer = async (court) => (await one(`select scored_by, scored_at from session_matches where session_id = $1 and court_no = $2`, [ks, court]));
  console.assert((await scorer(1)).scored_by === members[0] && new Date((await scorer(1)).scored_at).toISOString() === "2026-01-01T10:00:00.000Z", "match yang tidak berubah tetap mencatat penginput skor aslinya");
  console.assert((await scorer(2)).scored_by === fixer, "match yang dikoreksi tercatat atas nama admin");
  console.assert((await one(`select status from sessions where id = $1`, [ks])).status === "completed", "sesi tetap selesai");
  console.assert((await one(`select correct_session_result($1, $2::jsonb) n`, [ks, lineup(5)])).n === 0, "koreksi ulang yang sama tidak menambah poin");
  // Hapus skor court 2 (match tidak dimainkan) → member 5 & 6 turun dari podium (baris "tidak lagi juara"),
  // member 3 & 4 (10 poin) naik ke #3.
  const scoresOf = ([[a1, b1], [a2, b2]]) => JSON.stringify([
    { round_no: 1, court_no: 1, a1: parts[0], a2: parts[1], b1: parts[2], b2: parts[3], score_a: a1, score_b: b1 },
    { round_no: 1, court_no: 2, a1: parts[4], a2: parts[5], b1: parts[6], b2: parts[7], score_a: a2, score_b: b2 },
  ]);
  await one(`select correct_session_result($1, $2::jsonb) n`, [ks, scoresOf([[48, 10], [null, null]])]);
  console.assert((await total(members[0], ks)) === 100 && (await total(members[2], ks)) === 50 && (await total(members[4], ks)) === 0, `hapus skor court 2: #1 ${await total(members[0], ks)}, #3 ${await total(members[2], ks)}, keluar podium ${await total(members[4], ks)}`);
  console.assert((await one(`select count(*)::int n from points_ledger where member_id = $1 and session_id = $2 and note like '%tidak lagi juara'`, [members[4], ks])).n === 1, "member yang keluar podium dapat baris koreksi negatif");
  // Mode Win: menang sama → selisih skor. Court 1 30–0 (+30) vs court 2 40–35 (+5): di mode Point member 5
  // (40 poin) juara 1, di mode Win member 1 (selisih +30) juara 1 dan member 7 keluar podium.
  await db.query(`update sessions set leaderboard_mode = 'wins' where id = $1`, [ks]);
  await one(`select correct_session_result($1, $2::jsonb) n`, [ks, scoresOf([[30, 0], [40, 35]])]);
  console.assert((await total(members[0], ks)) === 100 && (await total(members[4], ks)) === 50 && (await total(members[6], ks)) === 0 && (await total(members[2], ks)) === 0, `mode Win: #1 ${await total(members[0], ks)}, #3 ${await total(members[4], ks)}, kalah ${await total(members[6], ks)}`);
  // Pemain booking website yang belum ada di daftar peserta (slot = member id) → baris peserta dibuat oleh
  // RPC, hanya untuk pemain yang dipakai; koreksi yang ditolak tidak meninggalkan baris peserta.
  await as(null);
  const [walkIn, noShow] = [(await one(`insert into auth.users default values returning id`)).id, (await one(`insert into auth.users default values returning id`)).id];
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Walk In', 'walk.in@mail.com'), ($2, 'No Show', 'no.show@mail.com')`, [walkIn, noShow]);
  await db.query(`insert into bookings (session_id, member_id, status) values ($1, $2, 'attended'), ($1, $3, 'registered')`, [ks, walkIn, noShow]);
  await as(fixer);
  const withWalkIn = (b2) => JSON.stringify([
    { round_no: 1, court_no: 1, a1: parts[0], a2: parts[1], b1: parts[2], b2: parts[3], score_a: 30, score_b: 0 },
    { round_no: 1, court_no: 2, a1: parts[4], a2: parts[5], b1: parts[6], b2: walkIn, score_a: b2, score_b: 0 },
  ]);
  const rosterOf = async (m) => (await one(`select count(*)::int n from session_participants where session_id = $1 and member_id = $2`, [ks, m])).n;
  console.assert(await fails(`select correct_session_result($1, $2::jsonb)`, [ks, withWalkIn(0)]), "skor 0–0 ditolak");
  console.assert((await rosterOf(walkIn)) === 0, "koreksi ditolak → tidak ada baris peserta baru");
  await one(`select correct_session_result($1, $2::jsonb) n`, [ks, withWalkIn(40)]);
  const walkInRow = (await one(`select id from session_participants where session_id = $1 and member_id = $2`, [ks, walkIn])).id;
  console.assert((await one(`select b2 from session_matches where session_id = $1 and court_no = 2`, [ks])).b2 === walkInRow, "slot member id → id peserta baru");
  console.assert((await rosterOf(noShow)) === 0, "booking yang tidak dipakai di koreksi tidak disalin jadi peserta");
  // Sesi yang belum berakhir tidak lewat jalur koreksi.
  await db.query(`update sessions set ended_at = null, status = 'published' where id = $1`, [ks]);
  console.assert(await fails(`select correct_session_result($1, $2::jsonb)`, [ks, lineup(5)]), "sesi belum berakhir tidak bisa dikoreksi");
  await as(null);
  console.log("✓ koreksi hasil: admin ganti line-up & skor sesi selesai → bonus juara dihitung ulang (baris koreksi, sekali)");
}

// Poin kehadiran sekali per member per activity: check-in dobel, batal lalu check-in lagi, dan booking
// yang dihapus lalu dibuat ulang tidak memberi poin dua kali.
{
  await as(null);
  const { id: m } = await one(`insert into auth.users default values returning id`);
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Hadir Sekali', 'hadir1@mail.com')`, [m]);
  const s = (await one(
    `insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
     values ('hadir-sekali', 'Open Stance Uji', 'weekly-mabar', $1, now(), now() + interval '2 hours', 20, 'published', 10) returning id`,
    [(await one(`select id from venues limit 1`)).id],
  )).id;
  const pts = async () => (await one(`select coalesce(sum(delta), 0)::int d, count(*)::int n from points_ledger where member_id = $1 and reason = 'attendance'`, [m]));
  const attend = (status) => db.query(`update bookings set status = $3 where session_id = $1 and member_id = $2`, [s, m, status]);
  await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, m]);
  await attend("attended");
  await attend("attended");
  console.assert((await pts()).d === 10, `check-in dua kali → ${(await pts()).d} pts`);
  await attend("registered");
  console.assert((await pts()).d === 0, "batal check-in → poin ditarik");
  await attend("attended");
  console.assert((await pts()).d === 10, "check-in lagi → tetap 10");
  console.assert((await one(`select note from points_ledger where member_id = $1 and reason = 'attendance'`, [m])).note === "Hadir di sesi · Open Stance Uji", "catatan poin menyebut nama activity");
  await db.query(`delete from bookings where session_id = $1 and member_id = $2`, [s, m]);
  await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, m]);
  await attend("attended");
  const after = await pts();
  console.assert(after.d === 10 && after.n === 1, `booking dibuat ulang lalu check-in → ${after.d} pts (${after.n} baris)`);
  console.log("✓ poin kehadiran sekali per activity: check-in dobel / batal lalu check-in / booking dibuat ulang");
}

// Hapus activity salah input (sudah selesai, ada peserta lunas & check-in): peserta, booking & activity
// terhapus; Keuangan otomatis dikoreksi jadi 0; poin kehadiran dinetralkan baris penyesuaian.
{
  await as(null);
  await db.exec(`update finance_settings set go_live_date = '2020-01-01'`);
  const venue = (await one(`select id from venues limit 1`)).id;
  const S = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, points_per_attendance)
    values ('salah-input', 'Mabar Salah Input', 'weekly-mabar', $1, now() - interval '5 hours', now() - interval '3 hours', 8, 'published', 10) returning id`, [venue])).id;
  const { id: m } = await one(`insert into auth.users default values returning id`);
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Salah Input', 'salah.input@mail.com')`, [m]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount, member_id) values ($1, 'Member', 'K1', 'kmember', 220000, $2)`, [S, m]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Tamu Kuyy', 'K2', 'ktamu', 220000)`, [S]);
  await db.query(`insert into session_participants (session_id, full_name, kuy_reg_no, source, payment_channel, amount) values ($1, 'Tamu Manual', 'M1', 'admin', 'manual', 220000)`, [S]);
  await db.query(`update session_participants set checked_in_at = now() where session_id = $1 and member_id = $2`, [S, m]);
  await db.query(`update sessions set status = 'completed', ended_at = now() where id = $1`, [S]);
  const refs = (await db.query(`select 'sp:' || id r from session_participants where session_id = $1`, [S])).rows.map((r) => r.r);
  const fin = async () => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source_ref = any($1) and deleted_at is null`, [refs])).s);
  const bal = async () => Number((await one(`select coalesce(sum(delta), 0) s from points_ledger where member_id = $1`, [m])).s);
  // Booking website yang ditandai lunas manual (bk:) & bonus review +10 tanpa booking (peserta impor Kuyy).
  const { id: w } = await one(`insert into auth.users default values returning id`);
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Booking Web', 'booking.web@mail.com')`, [w]);
  const wb = (await one(`insert into bookings (session_id, member_id, amount, source) values ($1, $2, 150000, 'website') returning id`, [S, w])).id;
  // Review & bonusnya tercatat di satu transaksi (submit_session_review) → created_at sama. Judul activity
  // sudah diganti sesudahnya; bonus review activity lain berjudul sama tidak ikut dinetralkan.
  await db.query(`with r as (insert into session_reviews (session_id, member_id, rating) values ($1, $2, 5) returning member_id)
    insert into points_ledger (member_id, delta, reason, note) select member_id, 10, 'bonus', 'Review sesi · Mabar Lama' from r`, [S, m]);
  await db.query(`insert into points_ledger (member_id, delta, reason, note, created_at) values ($1, 10, 'bonus', 'Review sesi · Mabar Salah Input', now() - interval '7 days')`, [m]);
  const bookingFin = async () => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source_ref = $1 and deleted_at is null`, ['bk:' + wb])).s);
  const before = await bal();
  console.assert((await fin()) === 660000, `activity selesai → 3 peserta lunas di Keuangan (${await fin()})`);
  const fails = (sql, params) => db.query(sql, params).then(() => false, () => true);
  await as(m);
  console.assert(await fails(`select delete_session_mistake($1, 'Mabar Salah Input')`, [S]), "member biasa tidak boleh menghapus activity");
  const boss = (await one(`insert into auth.users default values returning id`)).id;
  await as(null);
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Hapus', 'hapus@soslay.test', 'active' from roles where name = 'Super Admin'`, [boss]);
  await as(boss);
  await db.query(`select mark_booking_paid($1, true)`, [wb]);
  console.assert((await bookingFin()) === 150000, `Tandai Lunas booking website → Keuangan (${await bookingFin()})`);
  console.assert(await fails(`select delete_session_mistake($1, 'Mabar Salah')`, [S]), "judul tidak sama → ditolak");
  const n = (await one(`select delete_session_mistake($1, 'Mabar Salah Input') n`, [S])).n;
  await as(null);
  console.assert(n === 4, `jumlah peserta terhapus ${n}`);
  console.assert((await one(`select count(*)::int n from sessions where id = $1`, [S])).n === 0 && (await one(`select count(*)::int n from bookings where session_id = $1`, [S])).n === 0, "activity & booking terhapus");
  console.assert((await fin()) === 0, `Keuangan dikoreksi jadi 0 (${await fin()})`);
  console.assert((await bookingFin()) === 0, `Tandai Lunas booking website dikoreksi jadi 0 (${await bookingFin()})`);
  console.assert((await bal()) === before - 20, `poin kehadiran & bonus review dinetralkan (${before} → ${await bal()})`);
  console.log("✓ hapus activity salah input: peserta & booking terhapus, Keuangan (juga Tandai Lunas) dikoreksi, poin kehadiran & review dinetralkan");
}

// Supabase memasang pg_safeupdate untuk permintaan lewat API: UPDATE / DELETE tanpa WHERE ditolak ("UPDATE
// requires a WHERE clause") — juga di dalam fungsi yang dipanggil lewat RPC. PGlite tidak punya ekstensi itu,
// jadi definisi terakhir semua fungsi di schema public diperiksa di sini.
{
  const { rows } = await db.query(`select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prolang = (select oid from pg_language where lanname in ('plpgsql')) or (n.nspname = 'public' and p.prolang = (select oid from pg_language where lanname = 'sql'))`);
  // WHERE harus di level statement itu sendiri — WHERE di dalam subquery (mis. `set a = (select … where …)`)
  // tidak dihitung; string & komentar diabaikan.
  const missingWhere = (source) => {
    const src = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    const found = [];
    for (const m of src.matchAll(/\b(update|delete\s+from)\s+[\w.]+/gi)) {
      const before = src.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
      if (/(do|on|after|before|for|or|instead of)\s*$/.test(before)) continue; // on conflict do update, for update, trigger
      if (/^update\s+of\b/i.test(src.slice(m.index, m.index + 12))) continue;
      const end = src.indexOf(";", m.index);
      let stmt = src.slice(m.index, end === -1 ? undefined : end);
      while (/\([^()]*\)/.test(stmt)) stmt = stmt.replace(/\([^()]*\)/g, " ");
      if (!/\bwhere\b/i.test(stmt)) found.push(stmt.replace(/\s+/g, " ").slice(0, 80));
    }
    return found;
  };
  console.assert(
    missingWhere("update pg_temp.c set a = coalesce((select sp.id from sp where sp.member_id = c.a), a);").length === 1 &&
      missingWhere("update t set a = 1 where id in (select id from u); delete from v where x = 'a;b';").length === 0,
    "pemeriksa WHERE: WHERE di subquery tidak dihitung, WHERE statement dihitung",
  );
  const bad = rows.flatMap(({ proname, prosrc }) => missingWhere(prosrc).map((stmt) => `${proname}: ${stmt}`));
  console.assert(bad.length === 0, `UPDATE / DELETE tanpa WHERE (ditolak Supabase pg_safeupdate):\n${bad.join("\n")}`);
  console.log("✓ semua fungsi: UPDATE / DELETE selalu memakai WHERE (pg_safeupdate Supabase)");
}

// Poin review sesi dari Aturan poin (points_rules bonuses[key=review]): default +10, bisa diubah / dimatikan.
{
  await as(null);
  const venue = (await one(`select id from venues limit 1`)).id;
  const reviewer = async (slug) => {
    const { id: m } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [m, `Reviewer ${slug}`, `${slug}@mail.com`]);
    const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at)
      values ($1, $1, 'weekly-mabar', $2, now() - interval '4 hours', now() - interval '2 hours', 8, 'completed', now() - interval '1 hour') returning id`, [slug, venue])).id;
    await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, m]);
    await as(m);
    await db.query(`select submit_session_review($1, 5::smallint, '{}', null, null, null, null, false)`, [s]);
    await db.query(`select submit_session_review($1, 4::smallint, '{}', null, null, null, 'ubah', false)`, [s]); // ubah review → tidak dapat lagi
    await as(null);
    return (await one(`select coalesce(sum(delta), 0)::int d, count(*)::int n from points_ledger where member_id = $1 and note like 'Review sesi · %'`, [m]));
  };
  const rule = (review) => db.query(
    `update app_settings set value = jsonb_set(value, '{bonuses}', coalesce((select jsonb_agg(b) from jsonb_array_elements(value -> 'bonuses') b where b ->> 'key' <> 'review'), '[]') || $1::jsonb) where key = 'points_rules'`,
    [JSON.stringify(review ? [review] : [])],
  );
  await rule(null);
  const def = await reviewer("review-default");
  const tsReview = Number((await readFile(path.resolve(import.meta.dirname, "../src/lib/standings.ts"), "utf8")).match(/DEFAULT_REVIEW_POINTS = (\d+)/)?.[1]);
  console.assert(def.d === tsReview && def.n === 1, `aturan belum disimpan → +${tsReview} (DEFAULT_REVIEW_POINTS) sekali (${JSON.stringify(def)})`);
  await rule({ key: "review", points: 25, enabled: true });
  console.assert((await one(`select review_bonus_points() p`)).p === 25, "review_bonus_points membaca aturan");
  const custom = await reviewer("review-25");
  console.assert(custom.d === 25 && custom.n === 1, `aturan 25 → +25 sekali (${JSON.stringify(custom)})`);
  await rule({ key: "review", points: 25, enabled: false });
  const off = await reviewer("review-off");
  console.assert(off.n === 0, `aturan dimatikan → tanpa poin (${JSON.stringify(off)})`);
  // Nilai rusak di aturan tidak boleh menggagalkan kirim review → 0 poin.
  await rule({ key: "review", points: "abc", enabled: "ya" });
  console.assert((await one(`select review_bonus_points() p`)).p === 0, "nilai poin review rusak → 0, bukan error");
  await rule({ key: "review", points: 1000000, enabled: true });
  console.assert((await one(`select review_bonus_points() p`)).p === 1000000, "poin review besar (7 digit) tetap dipakai");
  await rule({ key: "review", points: "abc", enabled: "ya" });
  const broken = await reviewer("review-rusak");
  console.assert(broken.n === 0, `aturan rusak → review tetap terkirim tanpa poin (${JSON.stringify(broken)})`);
  await rule(null);
  console.log("✓ poin review sesi mengikuti Aturan poin: default +10, bisa diubah / dimatikan, sekali per sesi");
}

// Host sesi (tanpa booking / tidak ikut main) bisa memberi review; bukan peserta & bukan host tetap ditolak.
{
  await as(null);
  const venue = (await one(`select id from venues limit 1`)).id;
  const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at)
    values ('review-host', 'Review Host', 'weekly-mabar', $1, now() - interval '4 hours', now() - interval '2 hours', 8, 'completed', now() - interval '1 hour') returning id`, [venue])).id;
  const person = async (slug) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, slug, `${slug}@mail.com`]);
    return id;
  };
  const host = await person("host-review");
  const stranger = await person("orang-lain");
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host')`, [s, host]);
  const fails = (sql, params) => db.query(sql, params).then(() => false, () => true);
  await as(stranger);
  console.assert(await fails(`select submit_session_review($1, 5::smallint, '{}', null, null, null, null, false)`, [s]), "bukan peserta & bukan host tidak boleh memberi review");
  await as(host);
  // Rating "Host" dari host sendiri (mis. lewat API) diabaikan.
  await db.query(`select submit_session_review($1, 4::smallint, '{Format seru}', 5::smallint, 5::smallint, 4::smallint, 'Lancar', false)`, [s]);
  await as(null);
  const r = await one(`select rating, host_rating, venue_rating from session_reviews where session_id = $1 and member_id = $2`, [s, host]);
  console.assert(r?.rating === 4 && r.host_rating === null && r.venue_rating === 5, `review host tersimpan tanpa rating Host ${JSON.stringify(r)}`);
  // Poin review host (tanpa booking) tertaut ke sesinya → tampil di "Poin dari sesi ini".
  const pts = await one(`select coalesce(sum(delta), 0)::int d, count(*)::int n from points_ledger where member_id = $1 and session_id = $2 and note like 'Review sesi · %'`, [host, s]);
  console.assert(pts.n === 1 && pts.d === (await one(`select review_bonus_points() p`)).p, `poin review host tertaut ke sesi ${JSON.stringify(pts)}`);
  console.log("✓ host sesi (tanpa booking) bisa memberi review (tanpa rating Host, poin tertaut ke sesi); orang lain ditolak");
}

// Bonus juara per activity: juara 2 & 3 = 0 → tidak ada baris bonus; nilai lain mengikuti activity; koreksi
// memakai nilai activity itu juga; setelah selesai bonus terkunci.
{
  await as(null);
  await db.exec(`alter table sessions alter column podium_bonus set default '{10,0,0}'`); // default asli
  const venue = (await one(`select id from venues limit 1`)).id;
  const people = [];
  for (let i = 1; i <= 4; i++) {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, `Podium ${i}`, `podium${i}@mail.com`]);
    people.push(id);
  }
  const play = async (slug, bonus) => {
    // bonus null → kolom tidak diisi (default activity baru).
    const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, court_count, round_count${bonus ? ", podium_bonus" : ""})
      values ($1, $1, 'weekly-mabar', $2, now() - interval '3 hours', now() - interval '1 hour', 8, 'published', 'rotating', 1, 1${bonus ? ", $3" : ""}) returning id`, bonus ? [slug, venue, bonus] : [slug, venue])).id;
    const ids = [];
    for (const [i, m] of people.entries()) ids.push((await one(`insert into session_participants (session_id, full_name, kuy_reg_no, source, member_id) values ($1, $2, $3, 'admin', $4) returning id`, [s, `P${i}`, `${slug}${i}`, m])).id);
    // Pemain 1–2 menang 6–2 (juara 1), pemain 3–4 kalah (juara 3).
    await db.query(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2, score_a, score_b) values ($1, 1, 1, $2, $3, $4, $5, 6, 2)`, [s, ...ids]);
    await db.query(`select finish_session($1, null, now())`, [s]);
    const got = async (m) => (await one(`select coalesce(sum(delta), 0)::int d, count(*)::int n from points_ledger where member_id = $1 and session_id = $2 and reason = 'bonus' and is_podium`, [m, s]));
    return { s, ids, got };
  };
  const def = await play("podium-default", null);
  const first = await def.got(people[0]);
  const third = await def.got(people[2]);
  console.assert(first.d === 10 && third.n === 0, `10 / 0 / 0 → juara 1 +10, juara 3 tanpa baris (${JSON.stringify({ first, third })})`);
  const custom = await play("podium-custom", "{30,0,15}");
  console.assert((await custom.got(people[0])).d === 30 && (await custom.got(people[2])).d === 15, "nilai bonus mengikuti activity");
  // Koreksi: tim 3–4 jadi pemenang → bonus pindah sesuai nilai activity (30 / 15).
  const admin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Podium', 'podium@soslay.test', 'active' from roles where name = 'Super Admin'`, [admin]);
  // Poin review (+10, reason 'bonus' + session_id, bukan bonus juara) tidak boleh ikut dikoreksi.
  for (const m of [people[0], people[3]]) {
    await db.query(`insert into points_ledger (member_id, delta, reason, session_id, note) values ($1, 10, 'bonus', $2, 'Review sesi · podium-custom')`, [m, custom.s]);
  }
  const reviewPts = async (m) => (await one(`select coalesce(sum(delta), 0)::int d from points_ledger where member_id = $1 and session_id = $2 and not is_podium`, [m, custom.s])).d;
  await as(admin);
  await db.query(`select correct_session_result($1, $2::jsonb)`, [custom.s, JSON.stringify([{ round_no: 1, court_no: 1, a1: custom.ids[0], a2: custom.ids[1], b1: custom.ids[2], b2: custom.ids[3], score_a: 1, score_b: 6 }])]);
  await as(null);
  console.assert((await custom.got(people[0])).d === 15 && (await custom.got(people[2])).d === 30, "koreksi memakai bonus activity");
  console.assert((await reviewPts(people[0])) === 10 && (await reviewPts(people[3])) === 10, "koreksi tidak menarik poin review");
  console.assert((await custom.got(people[3])).d === 30, `pemenang baru yang juga mereview dapat bonus juara penuh (${(await custom.got(people[3])).d})`);
  // Sesi sudah selesai → bonus terkunci (nilai sama tetap boleh, mis. simpan ulang form).
  const locked = await db.query(`update sessions set podium_bonus = '{50,0,0}' where id = $1`, [def.s]).then(() => false, (e) => e.hint === "podium_locked");
  console.assert(locked, "bonus juara activity selesai terkunci");
  await db.query(`update sessions set podium_bonus = '{10,0,0}', title = title where id = $1`, [def.s]);
  // Nilai di luar aturan ditolak.
  const fresh = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status) values ('podium-baru', 'Podium Baru', 'weekly-mabar', $1, now() + interval '2 days', now() + interval '2 days 2 hours', 8, 'draft') returning id`, [venue])).id;
  const bad = await db.query(`update sessions set podium_bonus = '{10,0}' where id = $1`, [fresh]).then(() => false, () => true);
  console.assert(bad, "bonus juara harus 3 angka");
  console.log("✓ bonus juara per activity: default 10 / 0 / 0, nilai 0 tanpa baris, koreksi ikut nilai activity");
}

// Keuangan: go-live dimajukan → finance_resync_session (per activity) mencatat pemasukan peserta activity yang sudah selesai;
// finance_resync_session menyamakan nominal & nama dengan data activity. Hanya Super Admin Keuangan.
{
  await as(null);
  const venue = (await one(`select id from venues limit 1`)).id;
  await db.exec(`update finance_settings set go_live_date = '2099-01-01'`); // belum go-live
  const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ('fin-sync', 'Fin Sync', 'weekly-mabar', $1, now() - interval '5 hours', now() - interval '3 hours', 8, 'published') returning id`, [venue])).id;
  const kuy = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, 'Tamu Kuy', 'S1', 'tamukuy', 220000) returning id`, [s])).id;
  const man = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no, source, payment_channel, payment_status, amount) values ($1, 'Tamu BCA', 'S2', 'admin', 'manual', 'paid', 220000) returning id`, [s])).id;
  await db.query(`update sessions set status = 'completed', ended_at = now() where id = $1`, [s]);
  const net = async (source, ref) => Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = $1 and source_ref = $2 and deleted_at is null`, [source, ref])).s);
  console.assert((await net("kuyy_import", `sp:${kuy}`)) === 0, "sebelum go-live belum tercatat");
  const fails = (sql, params) => db.query(sql, params).then(() => false, () => true);
  const { id: nobody } = await one(`insert into auth.users default values returning id`);
  await as(nobody);
  console.assert(await fails(`select finance_resync_session($1)`, [s]), "bukan admin Keuangan tidak boleh sinkron");
  const boss = (await one(`insert into auth.users default values returning id`)).id;
  await as(null);
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Sync', 'sync@soslay.test', 'active' from roles where name = 'Super Admin'`, [boss]);
  await db.exec(`update finance_settings set go_live_date = '2020-01-01'`);
  await as(boss);
  // Aplikasi menyinkronkan per activity (saveFinanceSettings) — sama di sini.
  const synced = (await one(`select count(finance_resync_session(id))::int n from sessions where ended_at is not null or status = 'completed'`)).n;
  console.assert(synced >= 1, `activity selesai sejak go-live disinkronkan (${synced})`);
  console.assert((await net("kuyy_import", `sp:${kuy}`)) === 220000 && (await net("ticket_manual_paid", `sp:${man}`)) === 220000, "Kuyy → Saldo Kuyy, manual → akun bayar manual");
  // Keterangan transaksi yang tertinggal dari nama peserta → disamakan oleh Sync.
  await as(null);
  await db.query(`update finance_transactions set description = 'Tiket Kuyy · Nama Lama' where source_ref = $1`, [`sp:${kuy}`]);
  await as(boss);
  await db.query(`select finance_resync_session($1)`, [s]);
  console.assert((await one(`select description from finance_transactions where source_ref = $1 and amount > 0`, [`sp:${kuy}`])).description === "Tiket Kuyy · Tamu Kuy", "nama disamakan saat sync");
  const before = Number((await one(`select count(*) n from finance_transactions`)).n);
  await db.query(`select finance_resync_session($1)`, [s]);
  console.assert(Number((await one(`select count(*) n from finance_transactions`)).n) === before, "sync ulang tanpa perubahan tidak menambah transaksi");
  // Go-live dimundurkan sesudah tercatat → koreksi tetap jalan (dulu diam-diam dilewati).
  await as(null);
  await db.exec(`update finance_settings set go_live_date = '2099-01-01'`);
  await db.query(`update session_participants set payment_status = 'pending' where id = $1`, [man]);
  console.assert((await net("ticket_manual_paid", `sp:${man}`)) === 0, `batal lunas sesudah go-live dimundurkan → dikoreksi (${await net("ticket_manual_paid", `sp:${man}`)})`);
  console.log("✓ Keuangan: go-live dimajukan → activity selesai tercatat; Sync menyamakan nominal & nama; koreksi tetap jalan walau go-live dimundurkan; hanya admin Keuangan");
}

// Review terlihat oleh peserta & host activity itu (session_reviews_for); orang lain tidak dapat apa-apa.
{
  await as(null);
  const venue = (await one(`select id from venues limit 1`)).id;
  const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at)
    values ('review-lihat', 'Review Lihat', 'weekly-mabar', $1, now() - interval '4 hours', now() - interval '2 hours', 8, 'completed', now() - interval '1 hour') returning id`, [venue])).id;
  const person = async (name) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${id}@mail.com`]);
    return id;
  };
  const a = await person("Ayu Lestari");
  const b = await person("Budi Santoso");
  const host = await person("Hana Host");
  const stranger = await person("Orang Luar");
  for (const m of [a, b]) await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, m]);
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host')`, [s, host]);
  await as(a);
  await db.query(`select submit_session_review($1, 5::smallint, '{Format seru}', 4::smallint, null, null, 'Seru!', true)`, [s]);
  await as(host);
  const seen = (await db.query(`select name, rating, comment, host_rating from session_reviews_for($1)`, [s])).rows;
  console.assert(seen.length === 1 && seen[0].name === "Ayu" && seen[0].comment === "Seru!", `host melihat review peserta (nama depan) ${JSON.stringify(seen)}`);
  console.assert(seen[0].host_rating === null, "host tidak melihat rating Host dari peserta");
  await as(a);
  console.assert((await one(`select host_rating from session_reviews_for($1)`, [s])).host_rating === 4, "pemberi review melihat rating Host miliknya");
  await as(host);
  await as(b);
  console.assert((await db.query(`select 1 from session_reviews_for($1)`, [s])).rows.length === 1, "peserta lain melihat review");
  await as(stranger);
  console.assert((await db.query(`select 1 from session_reviews_for($1)`, [s])).rows.length === 0, "orang luar tidak melihat review");
  await as(null);
  console.log("✓ review activity terlihat oleh peserta & host (nama depan), tidak oleh orang luar");
}

// Juara yang masih tamu saat activity ditutup lalu daftar akun → bonus juara susulan saat baris pesertanya
// tertaut ke member (sekali saja).
{
  await as(null);
  const venue = (await one(`select id from venues limit 1`)).id;
  const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, match_format, court_count, round_count, podium_bonus)
    values ('juara-susulan', 'Juara Susulan', 'weekly-mabar', $1, now() - interval '3 hours', now() - interval '1 hour', 8, 'published', 'rotating', 1, 1, '{10,0,0}') returning id`, [venue])).id;
  const ids = [];
  for (let i = 1; i <= 4; i++) ids.push((await one(`insert into session_participants (session_id, full_name, kuy_reg_no, kuy_username, amount) values ($1, $2, $3, $4, 0) returning id`, [s, `Tamu ${i}`, `J${i}`, `tamu${i}`])).id);
  await db.query(`insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2, score_a, score_b) values ($1, 1, 1, $2, $3, $4, $5, 4, 0)`, [s, ...ids]);
  await db.query(`select finish_session($1, null, now())`, [s]);
  console.assert((await one(`select count(*)::int n from points_ledger where session_id = $1 and is_podium`, [s])).n === 0, "tamu saat ditutup → belum ada bonus");
  const { id: fredy } = await one(`insert into auth.users default values returning id`);
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Fredy Uji', 'fredy.uji@mail.com')`, [fredy]);
  await db.query(`update session_participants set member_id = $2 where id = $1`, [ids[0], fredy]);
  const got = async () => (await one(`select coalesce(sum(delta), 0)::int d, count(*)::int n from points_ledger where session_id = $1 and member_id = $2 and is_podium`, [s, fredy]));
  const first = await got();
  console.assert(first.d === 10 && first.n === 1, `daftar akun sesudah ditutup → bonus juara 1 susulan ${JSON.stringify(first)}`);
  await db.query(`update session_participants set member_id = $2 where id = $1`, [ids[0], fredy]);
  console.assert((await got()).n === 1, "bonus susulan tidak dobel");
  console.log("✓ bonus juara susulan untuk juara yang baru daftar akun sesudah activity ditutup (sekali)");
}

// Kudos (BR-23): kriteria uji spec bagian 6 (no. 13 & 14 — notifikasi — belum ada sistem notifikasi member).
{
  await as(null);
  // Jumlah di profil mengikuti ringkasan harian 20.00 WIB (diuji di akhir blok); di sini tanpa jeda.
  await db.exec(`set app.kudos_no_delay = 'on'`);
  const venue = (await one(`select id from venues limit 1`)).id;
  const person = async (name) => {
    const { id } = await one(`insert into auth.users default values returning id`);
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${name.toLowerCase().replace(/\W/g, "")}@kudos.test`]);
    return id;
  };
  const s = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at)
    values ('kudos-1', 'Kudos Mabar', 'weekly-mabar', $1, now() - interval '4 hours', now() - interval '2 hours', 12, 'completed', now() - interval '1 hour') returning id`, [venue])).id;
  const [A, B, C, D, H, P, E] = [await person("Kudo Arya"), await person("Kudo Bima"), await person("Kudo Citra"), await person("Kudo Dodi"), await person("Kudo Host"), await person("Kudo Foto"), await person("Kudo Eka")];
  for (const m of [A, B, D, E]) await db.query(`insert into bookings (session_id, member_id, status) values ($1, $2, 'attended')`, [s, m]);
  await db.query(`insert into bookings (session_id, member_id) values ($1, $2)`, [s, C]); // tidak check-in
  await db.query(`insert into session_hosts (session_id, member_id, role) values ($1, $2, 'host'), ($1, $3, 'photographer')`, [s, H, P]);

  const err = (sql, params) => db.query(sql, params).then(() => null, (e) => e.code);
  const give = (uid, to, cat, sess = s) => as(uid).then(() => err(`select give_kudos($1, $2, $3)`, [sess, to, cat]));
  const kudosPts = async (m) => Number((await one(`select coalesce(sum(delta), 0) d from points_ledger where member_id = $1 and kudos_id is not null`, [m])).d);
  const agg = async (m) => {
    await as(m);
    const r = (await one(`select member_kudos($1) k`, [m])).k;
    await as(null);
    return r;
  };
  const countOf = (k, key) => k.categories.find((c) => c.key === key)?.count ?? 0;

  // Kategori: 13 Skill + 9 Sikap, data tabel; nonaktif tidak bisa dipilih.
  const cats = await one(`select count(*) filter (where "group" = 'skill')::int skill, count(*) filter (where "group" = 'attitude')::int sikap from kudos_categories where is_active`);
  console.assert(cats.skill === 13 && cats.sikap === 9, `kategori kudos ${JSON.stringify(cats)}`);

  // 2. A memberi Forehand ke B → B Forehand +1, A +1 Slay Point.
  console.assert((await give(A, B, "forehand")) === null, "A tidak bisa memberi kudos ke B");
  let kb = await agg(B);
  console.assert(countOf(kb, "forehand") === 1 && kb.total === 1 && kb.unique_givers === 1 && (await kudosPts(A)) === 1, `kudos pertama ${JSON.stringify(kb)} poin ${await kudosPts(A)}`);
  // 3 & 5. Ganti ke Serve (juga "memberi lagi") → tetap 1 kudos, poin tetap.
  console.assert((await give(A, B, "serve")) === null, "ganti kategori gagal");
  kb = await agg(B);
  console.assert(countOf(kb, "forehand") === 0 && countOf(kb, "serve") === 1 && kb.total === 1 && (await kudosPts(A)) === 1, `ganti kategori ${JSON.stringify(kb)}`);
  console.assert((await one(`select count(*)::int n from kudos where session_id = $1 and giver_member_id = $2 and receiver_member_id = $3`, [s, A, B])).n === 1, "kudos dobel");
  // Simpan ulang kategori yang sama (perangkat kedua) → updated_at tidak bergeser (profil penerima tidak berkedip).
  const stamp = async () => (await one(`select updated_at::text t from kudos where session_id = $1 and giver_member_id = $2 and receiver_member_id = $3 and deleted_at is null`, [s, A, B])).t;
  const kudosStamp = await stamp();
  console.assert((await give(A, B, "serve")) === null && (await stamp()) === kudosStamp && (await kudosPts(A)) === 1, "simpan ulang kategori sama menggeser updated_at / poin");
  // 4. Batal → agregat turun, poin −1; batal lagi tidak apa-apa.
  await as(A);
  console.assert((await one(`select cancel_kudos($1, $2) ok`, [s, B])).ok === true && (await one(`select cancel_kudos($1, $2) ok`, [s, B])).ok === false, "batal kudos tidak idempotent");
  kb = await agg(B);
  console.assert(kb.total === 0 && (await kudosPts(A)) === 0, `batal kudos ${JSON.stringify(kb)} poin ${await kudosPts(A)}`);
  // Beri lagi sesudah batal → kudos baru, +1 lagi.
  console.assert((await give(A, B, "forehand")) === null && (await kudosPts(A)) === 1, "beri lagi sesudah batal");
  // 6. Diri sendiri → 422; 7. C tidak check-in → 403 & bukan penerima (404); fotografer & orang luar → 403.
  console.assert((await give(A, A, "serve")) === "PT422", "kudos ke diri sendiri tidak ditolak 422");
  console.assert((await give(C, B, "serve")) === "PT403", "peserta tidak hadir bisa memberi kudos");
  console.assert((await give(A, C, "serve")) === "PT404", "peserta tidak hadir bisa menerima kudos");
  console.assert((await give(P, B, "serve")) === "PT403" && (await give(E, P, "style")) === "PT404", "fotografer ikut kudos");
  console.assert((await give(A, D, "tidak_ada")) === "PT422", "kategori tidak valid tidak ditolak");
  await as(null);
  await db.query(`update kudos_categories set is_active = false where key = 'lob'`);
  console.assert((await give(A, D, "lob")) === "PT422", "kategori nonaktif masih bisa dipilih");
  // 8. Host tidak ikut main: Forehand → 422, Organiser → tersimpan. 9. Host memberi Backhand → +1.
  console.assert((await give(A, H, "forehand")) === "PT422", "host bukan pemain menerima kategori Skill");
  console.assert((await give(A, H, "organiser")) === null, "host bukan pemain tidak bisa menerima Sikap");
  console.assert((await give(H, D, "backhand")) === null && (await kudosPts(H)) === 1, "host bukan pemain tidak bisa memberi");
  // Daftar penerima pemberi: tanpa diri sendiri & yang tidak hadir; hanya kudos saya.
  await as(A);
  const mine = (await one(`select session_kudos($1) k`, [s])).k;
  const ids = mine.receivers.map((r) => r.member_id);
  console.assert(mine.can_edit && ids.length === 4 && !ids.includes(A) && !ids.includes(C) && !ids.includes(P) && mine.receivers.find((r) => r.member_id === H).role === "host", `session_kudos ${JSON.stringify(ids)}`);
  console.assert(mine.receivers.find((r) => r.member_id === D).category_key === null, "session_kudos membocorkan kudos orang lain (H → D)");
  await as(C);
  console.assert((await one(`select session_kudos($1) k`, [s])).k === null, "session_kudos untuk yang tidak hadir");
  // 10. Agregat & tabel tidak membocorkan pemberi ke member.
  await as(D);
  const kd = JSON.stringify((await one(`select member_kudos($1) k`, [D])).k);
  console.assert(!kd.includes(H) && !kd.includes("Kudo Host"), `member_kudos membocorkan pemberi ${kd}`);
  await db.exec(`grant usage on schema public to authenticated; grant select on kudos to authenticated`);
  await db.exec(`set role authenticated`);
  const leaked = (await one(`select count(*)::int n from kudos`)).n;
  await db.exec(`reset role`);
  await db.exec(`revoke select on kudos from authenticated`);
  console.assert(leaked === 0, "member bisa membaca tabel kudos (pemberi)");
  console.assert(!(await one(`select has_function_privilege('anon', 'member_kudos(uuid)', 'execute') ok`)).ok, "anon bisa memanggil member_kudos");
  // Agregat member lain tidak bisa dibaca sembarang member (hanya milik sendiri / admin / kartu peserta sesi).
  await as(C);
  console.assert((await one(`select member_kudos($1) k`, [D])).k === null, "member_kudos membuka agregat member lain");
  await as(null);
  for (const fn of ["kudos_revoke(uuid, text, text)", "kudos_role(uuid, uuid)", "kudos_window_closes_at(uuid)", "kudos_on_attendance_undone()"]) {
    for (const role of ["anon", "authenticated"]) console.assert(!(await one(`select has_function_privilege($1, $2, 'execute') ok`, [role, fn])).ok, `${role} bisa memanggil ${fn}`);
  }
  // Chip kudos teratas: host & admin saja.
  await as(H);
  const top = (await db.query(`select * from session_kudos_top($1)`, [s])).rows;
  console.assert(top.find((t) => t.member_id === D)?.category_key === "backhand" && top.find((t) => t.member_id === B)?.category_key === "forehand", `kudos teratas ${JSON.stringify(top)}`);
  await as(E);
  console.assert((await db.query(`select * from session_kudos_top($1)`, [s])).rows.length === 0, "kudos teratas terbaca peserta biasa");

  // 11. Admin hapus dengan alasan → agregat turun, poin −1, tercatat di log; tanpa alasan / bukan admin ditolak.
  const admin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Kudos', 'admin-kudos@soslay.test', 'active' from roles where name = 'Super Admin'`, [admin]);
  const ab = (await one(`select id from kudos where session_id = $1 and giver_member_id = $2 and receiver_member_id = $3 and deleted_at is null`, [s, A, B])).id;
  await as(E);
  console.assert((await err(`select admin_delete_kudos($1, 'iseng')`, [ab])) === "PT403", "member bisa menghapus kudos");
  const ptsA = await kudosPts(A);
  await as(admin);
  console.assert((await err(`select admin_delete_kudos($1, '  ')`, [ab])) === "PT422", "hapus kudos tanpa alasan");
  await db.query(`select admin_delete_kudos($1, 'Kudos salah orang')`, [ab]);
  console.assert((await err(`select admin_delete_kudos($1, 'lagi')`, [ab])) === "PT409", "hapus kudos dua kali");
  await as(null);
  const row = await one(`select deleted_source, deleted_reason, deleted_by from kudos where id = $1`, [ab]);
  const log = await one(`select actor_id, action from admin_audit_log where entity_type = 'kudos' and entity_id = $1`, [ab]);
  console.assert(row.deleted_source === "admin" && row.deleted_reason === "Kudos salah orang" && row.deleted_by === admin && (await agg(B)).total === 0 && ptsA === 2 && (await kudosPts(A)) === 1, `hapus admin ${JSON.stringify(row)} poin ${await kudosPts(A)}`);
  console.assert(log?.actor_id === admin && /Kudos salah orang/.test(log.action) && /Kudo Arya/.test(log.action), `log hapus kudos ${JSON.stringify(log)}`);

  // 12. Check-in D dibatalkan → kudos dari / ke D hilang, poin pemberi ke D ditarik.
  console.assert((await give(D, B, "volley")) === null && (await give(E, D, "slice")) === null, "kudos D");
  const before = { D: await kudosPts(D), E: await kudosPts(E), H: await kudosPts(H) };
  await as(null);
  await db.query(`update bookings set status = 'registered' where session_id = $1 and member_id = $2`, [s, D]);
  const left = (await one(`select count(*)::int n from kudos where session_id = $1 and deleted_at is null and $2 in (giver_member_id, receiver_member_id)`, [s, D])).n;
  console.assert(left === 0 && before.D === 1 && (await kudosPts(D)) === 0 && before.E === 1 && (await kudosPts(E)) === 0 && before.H === 1 && (await kudosPts(H)) === 0, `batal check-in D ${left} ${JSON.stringify(before)}`);
  console.assert((await one(`select count(*)::int n from kudos where session_id = $1 and deleted_source = 'system'`, [s])).n === 3, "hapus otomatis tidak bertanda system");

  // 15. Tiga teratas: jumlah terbanyak, seri → yang terbaru diterima.
  await db.query(`update bookings set status = 'attended' where session_id = $1 and member_id = $2`, [s, D]);
  await give(A, E, "serve");
  await give(B, E, "serve");
  await give(D, E, "footwork");
  await give(H, E, "fair_play");
  await as(null);
  await db.query(`update kudos set created_at = now() - interval '1 day' where receiver_member_id = $1 and category_key = 'footwork'`, [E]);
  const ke = await agg(E);
  console.assert(ke.categories.slice(0, 3).map((c) => c.key).join() === "serve,fair_play,footwork" && ke.total === 4 && ke.unique_givers === 4, `urutan kudos teratas ${JSON.stringify(ke.categories.slice(0, 3))}`);
  console.assert(ke.categories.some((c) => c.key === "lob") === false && ke.categories.length === 21, "kategori nonaktif tanpa kudos tetap tampil");
  await db.query(`update kudos_categories set is_active = true where key = 'lob'`);

  // 1. Jendela kudos sejak diakhiri (sementara 3 minggu; spec 7 hari) = KUDOS_WINDOW_DAYS di web/src/lib/kudos.ts:
  //    1 menit sebelum batas boleh, 1 menit sesudah → 409 & read-only.
  const windowDays = Number((await readFile(path.resolve(import.meta.dirname, "../src/lib/kudos.ts"), "utf8")).match(/KUDOS_WINDOW_DAYS = (\d+)/)?.[1]);
  const sqlDays = (await one(`select extract(day from kudos_window_closes_at($1) - ended_at)::int d from sessions where id = $1`, [s])).d;
  console.assert(windowDays === 21 && sqlDays === windowDays, `jendela kudos: kode ${windowDays} hari vs database ${sqlDays} hari`);
  await db.query(`update sessions set ended_at = now() - interval '21 days' + interval '1 minute' where id = $1`, [s]);
  console.assert((await give(A, D, "lob")) === null, "kudos ditolak sebelum jendela tutup");
  await as(null);
  await db.query(`update sessions set ended_at = now() - interval '21 days' - interval '1 minute' where id = $1`, [s]);
  console.assert((await give(A, D, "serve")) === "PT409" && (await err(`select cancel_kudos($1, $2)`, [s, D])) === "PT409", "kudos sesudah jendela tutup tidak ditolak 409");
  console.assert((await one(`select session_kudos($1) k`, [s])).k.can_edit === false, "UI kudos tidak read-only sesudah jendela tutup");
  // Sesi belum diakhiri / dibatalkan → tidak ada kudos.
  await as(null);
  const live = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ('kudos-live', 'Kudos Live', 'weekly-mabar', $1, now() - interval '1 hour', now() + interval '1 hour', 8, 'published') returning id`, [venue])).id;
  for (const m of [A, B]) await db.query(`insert into bookings (session_id, member_id, status) values ($1, $2, 'attended')`, [live, m]);
  console.assert((await give(A, B, "serve", live)) === "PT409", "kudos sebelum sesi diakhiri");
  await as(null);
  await db.query(`update sessions set status = 'cancelled', ended_at = now() where id = $1`, [live]);
  console.assert((await give(A, B, "serve", live)) === "PT409", "kudos di sesi dibatalkan");

  // Kartu peserta (klik nama di tab Peserta): sesi dihadiri + kudos teratas, tanpa pemberi; hanya orang sesi itu.
  {
    await as(A);
    const card = (await one(`select session_person_card($1, $2) c`, [s, E])).c;
    console.assert(card?.sessions_attended === 1 && card.kudos_total === 4 && card.kudos_top.map((t) => t.label).join() === "Serve,Fair play,Footwork", `kartu peserta ${JSON.stringify(card)}`);
    console.assert(!JSON.stringify(card).includes(H) && !JSON.stringify(card).includes("Kudo Host"), "kartu peserta membocorkan pemberi kudos");
    console.assert(!JSON.stringify((await one(`select member_kudos($1) k`, [E])).k).includes("last_received"), "member_kudos mengirim waktu kudos diterima");
    const pid = (await one(`insert into session_participants (session_id, member_id, full_name, kuy_reg_no, checked_in_at) values ($1, $2, 'Kudo Eka', 'KD1', now()) returning id`, [s, E])).id;
    console.assert((await one(`select session_person_card($1, $2) c`, [s, pid])).c?.kudos_total === 4, "kartu peserta lewat id baris peserta");
    // Baris peserta tambahan tanpa check-in (mis. impor ulang Kuyy) tidak membatalkan kehadiran → kudos tetap.
    await db.query(`insert into session_participants (session_id, member_id, full_name, kuy_reg_no) values ($1, $2, 'Kudo Eka', 'KD3')`, [s, E]);
    const stillE = await one(`select (select status from bookings where session_id = $1 and member_id = $2) st, (select count(*)::int from kudos where session_id = $1 and receiver_member_id = $2 and deleted_at is null) n`, [s, E]);
    console.assert(stillE.st === "attended" && stillE.n === 4, `impor ulang tanpa check-in menghapus kudos / kehadiran ${JSON.stringify(stillE)}`);
    const guest = (await one(`insert into session_participants (session_id, full_name, kuy_reg_no) values ($1, 'Tamu', 'KD2') returning id`, [s])).id;
    console.assert((await one(`select session_person_card($1, $2) c`, [s, guest])).c === null, "kartu peserta tamu tanpa akun");
    const outsider = await person("Kudo Luar");
    await as(outsider);
    console.assert((await one(`select session_person_card($1, $2) c`, [s, E])).c === null, "kartu peserta terbaca orang luar sesi");
    await as(null);
  }
  // Akun pemberi dihapus → kudos tetap terhitung, pemberi dianonimkan.
  await as(null);
  const totalE = (await agg(E)).total;
  await db.query(`delete from profiles where id = $1`, [H]);
  const ke2 = await agg(E);
  console.assert(ke2.total === totalE && ke2.unique_givers === 4, `akun pemberi dihapus ${JSON.stringify(ke2)}`);
  // Activity salah input dihapus → poin kudos ikut dinetralkan (sekali).
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [admin]);
  await db.query(`select delete_session_mistake($1, 'Kudos Mabar')`, [s]);
  await as(null);
  const net = Number((await one(`select coalesce(sum(delta), 0) d from points_ledger where member_id = $1 and (kudos_id is not null or note like 'Activity dihapus%')`, [A])).d);
  console.assert(net === 0, `poin kudos sesudah activity dihapus ${net}`);
  // Profil mengikuti ringkasan harian: kudos yang baru diberi belum terlihat sampai 20.00 WIB berikutnya (K-7).
  {
    const s2 = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status, ended_at)
      values ('kudos-2', 'Kudos Delay', 'weekly-mabar', $1, now() - interval '4 hours', now() - interval '2 hours', 12, 'completed', now() - interval '1 hour') returning id`, [venue])).id;
    await db.query(`insert into kudos (session_id, giver_member_id, receiver_member_id, receiver_role, category_key) values ($1, $2, $3, 'participant', 'lob')`, [s2, D, B]);
    const lobNow = countOf(await agg(B), "lob");
    await db.exec(`set app.kudos_no_delay = 'off'`);
    const lobDelayed = countOf(await agg(B), "lob");
    const cut = await one(`select kudos_visible_until() <= now() past, kudos_visible_until() > now() - interval '24 hours' recent, to_char(kudos_visible_until() at time zone 'Asia/Jakarta', 'HH24:MI') hm`);
    await db.exec(`set app.kudos_no_delay = 'on'`);
    console.assert(lobNow === 1 && lobDelayed === 0 && cut.past && cut.recent && cut.hm === "20:00", `jumlah kudos profil tidak menunggu ringkasan harian ${lobNow}/${lobDelayed} ${JSON.stringify(cut)}`);
    console.assert(!(await one(`select has_function_privilege('authenticated', 'kudos_visible_until()', 'execute') ok`)).ok, "member bisa memanggil kudos_visible_until");
  }
  // Kategori hanya bisa diubah admin Settings (halaman Aturan poin), bukan member.
  // Seperti Supabase, tabel bisa ditulis role authenticated — RLS yang menjaga. Dijalankan sebagai role itu.
  await db.exec(`grant select, update on kudos_categories to authenticated`);
  await as(A);
  await db.exec(`set role authenticated`);
  await db.query(`update kudos_categories set is_active = false where key = 'style'`).catch(() => null);
  await db.exec(`reset role`);
  await as(null);
  console.assert((await one(`select is_active from kudos_categories where key = 'style'`)).is_active === true, "member bisa menonaktifkan kategori kudos");
  await db.exec(`reset app.kudos_no_delay`);
  console.log("✓ kudos: beri / ganti / batal (+1 / tetap / −1), 1 per penerima, 403 / 404 / 422 / 409, host hanya Sikap, anonim, hapus admin + log, batal check-in, 3 teratas, jendela 3 minggu, kartu peserta, profil per ringkasan harian");
}

// Shop checkout & bayar transfer (aturan bisnis Shop draft v1 §11): harga/ongkir dari server, stok dikunci,
// kode unik tidak bentrok, bukti → verifikasi (setujui: Keuangan A-2 + poin; tolak: batas +24 jam, ke-3 batal),
// lewat batas tanpa bukti → batal & stok kembali, J&T dikirim > 7 hari → selesai.
{
  const user = async (name) => {
    const id = (await one(`insert into auth.users default values returning id`)).id;
    await db.query(`insert into profiles (id, full_name, email) values ($1, $2, $3)`, [id, name, `${id}@shop.test`]);
    return id;
  };
  const buyer = await user("Arya Shop");
  const shopAdmin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Rara Shop', 'rara.shop@soslay.test', 'active' from roles where name = 'Super Admin'`, [shopAdmin]);
  const prod = (await one(`insert into products (slug, sku, name, category, price, status, weight_grams) values ('a-piece-of-bali', 'SOS-T-BALI', 'A Piece of Bali', 'apparel', 220000, 'active', 300) returning id`)).id;
  const varXXL = (await one(`insert into product_variants (product_id, sku, options, stock) values ($1, 'SOS-T-BALI-XXL', '{"size":"XXL"}', 5) returning id`, [prod])).id;
  const stock = async () => (await one(`select stock from product_variants where id = $1`, [varXXL])).stock;
  const item = (qty = 1) => JSON.stringify([{ slug: "a-piece-of-bali", options: { fit: "Relaxed Fit", size: "XXL" }, quantity: qty }]);
  const jnt = JSON.stringify({ method: "jnt", name: "Arya", phone: "081234567890", address: "Jl. Kemang Raya No. 12", city: "Kota Jakarta Selatan", postal_code: "12730" });
  const err = async (sql, params) => db.query(sql, params).then(() => null, (e) => e.message);

  await as(buyer);
  // 1) J&T Jakarta Selatan, 0,3 kg → 1 kg → Rp18.000; total = 220.000 + 18.000 + kode unik
  const c1 = (await one(`select place_shop_order($1, $2) c`, [item(), jnt])).c;
  const o1 = await one(`select * from orders where code = $1`, [c1]);
  console.assert(o1.shipping_fee === 18000 && o1.subtotal === 220000 && o1.total === 238000 + o1.unique_code && o1.unique_code >= 1, `ongkir J&T ${JSON.stringify(o1)}`);
  console.assert((await stock()) === 4, "stok dikunci saat pesanan dibuat");
  console.assert((await err(`select place_shop_order($1, $2)`, [item(1), JSON.stringify({ ...JSON.parse(jnt), city: "Kota Medan" })]))?.includes("belum tersedia"), "kota di luar master J&T ditolak");
  console.assert((await err(`select place_shop_order($1, $2)`, [item(9), jnt]))?.includes("Stok"), "stok tidak cukup ditolak");
  // 2) Instant (3 km pertama): ±8,4 km → Rp33.000; Depok → ditolak; > 25 km → ditolak
  const near = { method: "instant", name: "Arya", phone: "0812", address: "Jl. X", city: "Kota Jakarta Pusat", postal_code: "10310", lat: -6.2088, lng: 106.8456 };
  const c2 = (await one(`select place_shop_order($1, $2) c`, [item(), JSON.stringify(near)])).c;
  const o2 = await one(`select shipping_fee, distance_km from orders where code = $1`, [c2]);
  const expectFee = Math.ceil((15000 + Math.ceil(Math.max(0, Number(o2.distance_km) - 3)) * 3000) / 1000) * 1000;
  console.assert(o2.shipping_fee === expectFee && Number(o2.distance_km) > 5, `ongkir Instant ${JSON.stringify(o2)}`);
  console.assert((await err(`select place_shop_order($1, $2)`, [item(), JSON.stringify({ ...near, city: "Kota Depok" })]))?.includes("DKI"), "Instant Depok ditolak");
  console.assert((await err(`select place_shop_order($1, $2)`, [item(), JSON.stringify({ ...near, lat: -6.05, lng: 106.6 })]))?.includes("25 km"), "Instant > 25 km ditolak");
  // Rekening di-snapshot per pesanan; Instant tidak bergantung pada baris ongkir J&T; simpan pengaturan hanya admin Settings.
  const bank2 = await one(`select payment_method, payment_bank->>'accountNo' acc from orders where code = $1`, [c2]);
  console.assert(bank2.payment_method === "Transfer BCA" && bank2.acc === "123 456 7890", `rekening di-snapshot ${JSON.stringify(bank2)}`);
  await as(null);
  await db.query(`update shipping_rates set is_active = false where city = 'Kota Jakarta Pusat'`);
  await as(buyer);
  console.assert(typeof (await one(`select place_shop_order($1, $2) c`, [item(), JSON.stringify(near)])).c === "string", "Instant tetap bisa walau J&T kota Jakarta nonaktif");
  console.assert((await err(`select save_shop_settings('{}'::jsonb, '{}'::jsonb, '[]'::jsonb)`))?.includes("izin"), "member tidak bisa mengubah pengaturan shop");
  await as(null);
  await db.query(`update shipping_rates set is_active = true where city = 'Kota Jakarta Pusat'`);
  await as(buyer);
  // 3) Pickup: ongkir 0, hanya Mabar 14 hari ke depan
  await as(null);
  const mk = async (slug, days) => (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ($1, 'Mabar', 'weekly-mabar', $2, now() + make_interval(days => $3), now() + make_interval(days => $3) + interval '3 hours', 12, 'published') returning id`, [slug, venue, days])).id;
  const soon = await mk("shop-pick-5", 5);
  const far = await mk("shop-pick-20", 20);
  await as(buyer);
  const c3 = (await one(`select place_shop_order($1, $2) c`, [item(), JSON.stringify({ method: "pickup", name: "Arya", phone: "0812", session_id: soon })])).c;
  console.assert((await one(`select shipping_fee from orders where code = $1`, [c3])).shipping_fee === 0, "pickup gratis");
  console.assert((await err(`select place_shop_order($1, $2)`, [item(), JSON.stringify({ method: "pickup", name: "Arya", phone: "0812", session_id: far })]))?.includes("pilih sesi lain"), "sesi > 14 hari ditolak");
  // 10) kode unik order aktif tidak pernah sama
  const codes = (await db.query(`select unique_code from orders where status = 'pending' and payment_status = 'pending'`)).rows.map((r) => r.unique_code);
  console.assert(new Set(codes).size === codes.length, `kode unik bentrok ${codes}`);

  // Bukti → setujui: wajib centang mutasi; Keuangan A-2 = total transfer; +22 poin
  const proof = (amount) => JSON.stringify({ path: "x/y.jpg", name: "bukti.jpg", size: 1000, sender_name: "Arya", sender_bank: "BCA", amount, transfer_date: "2026-11-13" });
  await db.query(`select submit_payment_proof($1, $2)`, [c1, proof(o1.total)]);
  await db.query(`select submit_payment_proof($1, $2)`, [c1, proof(o1.total)]); // Ganti bukti
  console.assert((await one(`select count(*) filter (where p.status = 'pending')::int pe, count(*) filter (where p.status = 'replaced')::int r from order_payment_proofs p join orders o on o.id = p.order_id where o.code = $1`, [c1])).r === 1, "bukti lama ditandai replaced");
  console.assert((await err(`select review_payment_proof($1, true, true)`, [c1]))?.includes("izin"), "member tidak bisa memverifikasi");
  await db.query(`update finance_settings set go_live_date = '2020-01-01' where true`); // uji: sudah go-live
  await as(shopAdmin);
  console.assert((await err(`select review_payment_proof($1, true, false)`, [c1]))?.includes("mutasi"), "setujui tanpa centang mutasi ditolak");
  await db.query(`select review_payment_proof($1, true, true)`, [c1]);
  const paid = await one(`select status, payment_status, points_awarded, id from orders where code = $1`, [c1]);
  const fin = Number((await one(`select coalesce(sum(amount), 0) s from finance_transactions where source = 'shop_order_verified' and source_ref = $1 and deleted_at is null`, ["ord:" + paid.id])).s);
  console.assert(paid.status === "processing" && paid.payment_status === "paid" && paid.points_awarded === 22 && fin === o1.total, `setujui ${JSON.stringify(paid)} keuangan ${fin}`);
  console.assert(Number((await one(`select coalesce(sum(delta), 0) d from points_ledger where order_id = $1`, [paid.id])).d) === 22, "+22 Slay Point");

  // Tolak → batas +24 jam; tolak ke-3 → batal, stok kembali
  await as(buyer);
  const before = await stock();
  for (let i = 1; i <= 3; i++) {
    await as(buyer);
    await db.query(`select submit_payment_proof($1, $2)`, [c3, proof(1)]);
    await as(shopAdmin);
    console.assert((await err(`select review_payment_proof($1, false, false, 'Lainnya', '')`, [c3]))?.includes("pesan"), "Lainnya wajib pesan");
    const r = (await one(`select review_payment_proof($1, false, false, 'Bukti tidak terbaca / terpotong', 'Terpotong') r`, [c3])).r;
    if (i < 3) {
      const d = await one(`select pay_deadline > now() + interval '23 hours' ok, status from orders where code = $1`, [c3]);
      console.assert(r.result === "rejected" && d.ok && d.status === "pending", `tolak ke-${i} ${JSON.stringify(r)}`);
    } else console.assert(r.result === "cancelled", `tolak ke-3 batal ${JSON.stringify(r)}`);
  }
  console.assert((await stock()) === before + 1, "tolak ke-3 → stok kembali");

  // Lewat batas tanpa bukti → batal otomatis, stok kembali; yang menunggu verifikasi tidak ikut
  await as(null);
  await db.query(`update orders set pay_deadline = now() - interval '1 minute' where code = $1`, [c2]);
  const s0 = await stock();
  await db.query(`select expire_shop_orders()`);
  console.assert((await one(`select status from orders where code = $1`, [c2])).status === "cancelled" && (await stock()) === s0 + 1, "batal otomatis 24 jam");

  // Admin batal sesudah lunas → poin dicabut; J&T dikirim > 7 hari → selesai
  await db.query(`update orders set status = 'shipped', shipped_at = now() - interval '8 days' where code = $1`, [c1]);
  await db.query(`select expire_shop_orders()`);
  console.assert((await one(`select status from orders where code = $1`, [c1])).status === "completed", "J&T selesai otomatis 7 hari");
  await as(buyer);
  const c4 = (await one(`select place_shop_order($1, $2) c`, [item(), jnt])).c;
  await db.query(`select submit_payment_proof($1, $2)`, [c4, proof(1)]);
  await as(shopAdmin);
  await db.query(`select review_payment_proof($1, true, true)`, [c4]);
  await db.query(`update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Uji' where code = $1`, [c4]);
  const net4 = Number((await one(`select coalesce(sum(delta), 0) d from points_ledger where order_id = (select id from orders where code = $1)`, [c4])).d);
  console.assert(net4 === 0, `poin dicabut saat batal ${net4}`);
  await as(null);
  console.log("✓ shop checkout: ongkir J&T/Instant/Pickup dari server, stok dikunci, kode unik, setujui (mutasi wajib, Keuangan, +poin), tolak +24 jam & ke-3 batal, batal otomatis, J&T selesai 7 hari, poin dicabut");
}

// Penukaran Slay Point oleh member: poin & stok dipotong saat menukar; Produk/Merch dikirim (order ongkir) atau
// diambil di activity; Voucher/Sesi/Pengalaman disetujui admin dengan kode voucher; batal → poin & stok kembali.
{
  const member = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into profiles (id, full_name, email) values ($1, 'Rina Reward', 'rina.reward@test.id')`, [member]);
  const crm = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Rara CRM', 'rara.crm@soslay.test', 'active' from roles where name = 'Super Admin'`, [crm]);
  await db.query(`insert into points_ledger (member_id, delta, reason, note) values ($1, 3000, 'bonus', 'saldo uji')`, [member]);
  const balance = async () => (await one(`select coalesce(sum(delta), 0)::int b from points_ledger where member_id = $1`, [member])).b;
  const reward = async (name, category, cost, stock) =>
    (await one(`insert into rewards (name, category, points_cost, stock) values ($1, $2::reward_category, $3, $4) returning id`, [name, category, cost, stock])).id;
  const racket = await reward("Raket partner", "product", 1000, 2);
  const voucher = await reward("Voucher Shop", "voucher", 300, null);
  const shipJnt = { method: "jnt", name: "Rina", phone: "0812", address: "Jl. Uji 1", city: "Kota Jakarta Selatan", postal_code: "12730" };
  const err = async (sql, params) => db.query(sql, params).then(() => null, (e) => e.message);
  const startBalance = await balance();

  await as(member);
  await db.exec(`grant select, insert on reward_redemptions to authenticated`);
  await db.exec(`set role authenticated`);
  console.assert((await err(`insert into reward_redemptions (member_id, reward_id, points) values ($1, $2, 1)`, [member, voucher])) !== null, "member tidak bisa insert penukaran langsung");
  await db.exec(`reset role`);
  console.assert((await err(`select redeem_reward($1)`, [racket]))?.includes("pengiriman"), "Produk wajib pilih pengiriman");
  // 1) Produk via J&T → order ongkir (channel reward), poin & stok langsung terpotong
  const r1 = (await one(`select redeem_reward($1, $2) r`, [racket, JSON.stringify(shipJnt)])).r;
  const ord = await one(`select channel, subtotal, shipping_fee, total, unique_code, status from orders where code = $1`, [r1.order_code]);
  console.assert(ord.channel === "reward" && ord.subtotal === 0 && ord.shipping_fee === 18000 && ord.total === 18000 + ord.unique_code, `order ongkir reward ${JSON.stringify(ord)}`);
  console.assert((await balance()) === startBalance - 1000, "poin dipotong saat menukar");
  console.assert((await one(`select stock from rewards where id = $1`, [racket])).stock === 1, "stok dipotong saat menukar");
  // Ongkir tidak dibayar sampai batas → order batal → penukaran ditolak, poin & stok kembali
  await as(null);
  await db.query(`update orders set pay_deadline = now() - interval '1 minute' where code = $1`, [r1.order_code]);
  await db.query(`select expire_shop_orders()`);
  const rd1 = await one(`select status from reward_redemptions where code = $1`, [r1.code]);
  console.assert(rd1.status === "rejected" && (await balance()) === startBalance && (await one(`select stock from rewards where id = $1`, [racket])).stock === 2, `batal ongkir → poin & stok kembali ${JSON.stringify(rd1)}`);

  // 2) Produk via J&T dibayar → disetujui otomatis; dikirim → selesai
  await as(member);
  const r2 = (await one(`select redeem_reward($1, $2) r`, [racket, JSON.stringify(shipJnt)])).r;
  await as(crm);
  console.assert((await err(`select set_redemption_status($1, 'approved')`, [r2.code]))?.includes("Ongkir"), "admin tidak bisa setujui sebelum ongkir dibayar");
  await as(null);
  await db.query(`update orders set payment_status = 'paid', status = 'processing', paid_at = now() where code = $1`, [r2.order_code]);
  console.assert((await one(`select status from reward_redemptions where code = $1`, [r2.code])).status === "approved", "ongkir lunas → disetujui");
  const fin = await one(`select c.system_key k, t.amount::int amount from finance_transactions t join finance_categories c on c.id = t.category_id join orders o on t.source_ref = 'ord:' || o.id where o.code = $1 and t.deleted_at is null`, [r2.order_code]);
  console.assert(fin?.k === "reward_shipping", `ongkir reward tercatat sebagai Ongkir penukaran reward ${JSON.stringify(fin)}`);
  await db.query(`update orders set status = 'shipped', shipped_at = now() where code = $1`, [r2.order_code]);
  console.assert((await one(`select status from reward_redemptions where code = $1`, [r2.code])).status === "fulfilled", "dikirim → selesai");

  // 3) Produk ambil di activity (bukan hanya Mabar), tanpa ongkir
  const act = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ('reward-pick', 'Social Match', 'social', $1, now() + interval '3 days', now() + interval '3 days 3 hours', 12, 'published') returning id`, [venue])).id;
  await as(member);
  const r3 = (await one(`select redeem_reward($1, $2) r`, [racket, JSON.stringify({ method: "pickup", name: "Rina", phone: "0812", session_id: act })])).r;
  console.assert(r3.order_code === null, "ambil di activity tanpa order ongkir");
  console.assert((await err(`select redeem_reward($1, $2)`, [racket, JSON.stringify({ method: "pickup", name: "Rina", phone: "0812", session_id: act })]))?.includes("Stok"), "stok habis ditolak");

  // 4) Voucher: tanpa pengiriman, admin wajib isi kode voucher saat menyetujui; tolak → poin kembali
  const r4 = (await one(`select redeem_reward($1) r`, [voucher])).r;
  console.assert((await err(`select set_redemption_status($1, 'approved')`, [r4.code]))?.includes("izin"), "member tidak bisa menyetujui");
  await as(crm);
  console.assert((await err(`select set_redemption_status($1, 'approved')`, [r4.code]))?.includes("kode voucher"), "setujui voucher tanpa kode ditolak");
  await db.query(`select set_redemption_status($1, 'approved', null, 'SLAY-50K-001', '2026-12-31')`, [r4.code]);
  const v4 = await one(`select status, voucher_code, voucher_valid_until::text until from reward_redemptions where code = $1`, [r4.code]);
  console.assert(v4.status === "approved" && v4.voucher_code === "SLAY-50K-001" && v4.until === "2026-12-31", `kode voucher tersimpan ${JSON.stringify(v4)}`);
  const before = await balance();
  await as(member);
  const r5 = (await one(`select redeem_reward($1) r`, [voucher])).r;
  await as(crm);
  await db.query(`select set_redemption_status($1, 'rejected', 'Uji tolak')`, [r5.code]);
  console.assert((await balance()) === before, "voucher ditolak → poin kembali");
  // Saldo kurang ditolak
  await as(member);
  const big = await reward("Trip mahal", "experience", 99999, null);
  console.assert((await err(`select redeem_reward($1)`, [big]))?.includes("belum cukup"), "poin kurang ditolak");
  // Reward yang dinonaktifkan tetap terbaca oleh member yang pernah menukarnya (riwayat), tidak oleh member lain
  await as(null);
  await db.query(`update rewards set is_active = false where id = $1`, [racket]);
  await db.exec(`grant select on rewards to authenticated`);
  await as(member);
  await db.exec(`set role authenticated`);
  const seen = (await one(`select count(*)::int n from rewards where id = $1`, [racket])).n;
  await db.exec(`reset role`);
  console.assert(seen === 1, "reward nonaktif tetap terbaca pemilik penukaran");
  await as(null);
  console.log("✓ penukaran reward member: poin & stok dipotong saat tukar, Produk/Merch J&T/Instant via order ongkir (lunas → disetujui, kirim → selesai, batal → poin & stok kembali), ambil di activity, voucher wajib kode, tolak → poin kembali");
}

// Galeri foto: foto dikaitkan ke activity (album otomatis tayang), tag hanya peserta activity, caption, tampil di galeri venue.
{
  const err = async (sql, params) => db.query(sql, params).then(() => null, (e) => e.message);
  const admin = (await one(`insert into auth.users default values returning id`)).id;
  await db.query(`insert into staff_members (user_id, role_id, full_name, email, status) select $1, id, 'Admin Galeri', 'galeri@soslay.test', 'active' from roles where name = 'Super Admin'`, [admin]);
  const person = async (name, ig) => {
    const id = (await one(`insert into auth.users default values returning id`)).id;
    await db.query(`insert into profiles (id, full_name, email, instagram) values ($1, $2, $3, $4)`, [id, name, `${id}@test.id`, ig]);
    return id;
  };
  const player = await person("Felisya Fernanda", "felisyafernanda");
  const outsider = await person("Orang Lain", null);
  const gv = (await one(`insert into venues (slug, name, city) values ('galeri-venue', 'Galeri Venue', 'Jakarta') returning id`)).id;
  const past = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ('galeri-past', 'Mabar Galeri', 'weekly-mabar', $1, now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 12, 'completed') returning id`, [gv])).id;
  const future = (await one(`insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, status)
    values ('galeri-future', 'Mabar Nanti', 'weekly-mabar', $1, now() + interval '2 days', now() + interval '2 days 2 hours', 12, 'published') returning id`, [gv])).id;
  await db.query(`insert into bookings (session_id, member_id, status) values ($1, $2, 'attended')`, [past, player]);

  await as(player);
  console.assert((await err(`select save_gallery_photo(null, $1, 'https://x/a.jpg', 'Halo', '{}')`, [past]))?.includes("izin"), "member tidak bisa upload galeri");
  await as(admin);
  console.assert((await err(`select save_gallery_photo(null, $1, 'https://x/a.jpg', null, '{}')`, [future]))?.includes("sudah berlangsung"), "activity yang belum berlangsung ditolak");
  console.assert((await err(`select save_gallery_photo(null, $1, 'https://x/a.jpg', null, $2)`, [past, [outsider]]))?.includes("tidak ikut main"), "tag non-peserta ditolak");
  const photo = (await one(`select save_gallery_photo(null, $1, 'https://x/a.jpg', '  Rally pagi  ', $2) id`, [past, [player]])).id;
  const second = (await one(`select save_gallery_photo(null, $1, 'https://x/b.jpg', null, '{}') id`, [past])).id;
  const album = await one(`select count(*)::int n, min(status::text) status, min(cover_photo::text) cover from photo_albums where session_id = $1`, [past]);
  console.assert(album.n === 1 && album.status === "published" && album.cover === photo, `satu album tayang per activity ${JSON.stringify(album)}`);
  console.assert((await one(`select caption from photos where id = $1`, [photo])).caption === "Rally pagi", "caption dirapikan");
  await db.query(`select save_gallery_photo($1, null, null, '', '{}')`, [photo]);
  const edited = await one(`select caption, (select count(*)::int from photo_tags where photo_id = $1) tags from photos where id = $1`, [photo]);
  console.assert(edited.caption === null && edited.tags === 0, `edit: caption kosong & tag dilepas ${JSON.stringify(edited)}`);
  await db.query(`select save_gallery_photo($1, null, null, 'Tos!', $2)`, [photo, [player]]);
  // Booking member ter-tag batal → foto tetap bisa diedit (tag lama tidak dicek ulang)
  await db.query(`update bookings set status = 'cancelled' where session_id = $1 and member_id = $2`, [past, player]);
  console.assert((await err(`select save_gallery_photo($1, null, null, 'Tos lagi!', $2)`, [photo, [player]])) === null, "edit caption tetap bisa walau booking member ter-tag batal");
  await db.query(`select save_gallery_photo($1, null, null, 'Tos!', $2)`, [photo, [player]]);
  await db.query(`update bookings set status = 'attended' where session_id = $1 and member_id = $2`, [past, player]);
  // Cover album dihapus → pindah ke foto lain
  const third = (await one(`select save_gallery_photo(null, $1, 'https://x/c.jpg', null, '{}') id`, [past])).id;
  await db.query(`update photo_albums set cover_photo = $1 where session_id = $2`, [third, past]);
  await db.query(`delete from photos where id = $1`, [third]);
  console.assert((await one(`select cover_photo::text c from photo_albums where session_id = $1`, [past])).c === photo, "hapus foto cover → cover pindah ke foto tertua");

  await as(null);
  await db.exec(`set role anon`);
  const rows = (await db.query(`select * from venue_gallery('galeri-venue')`)).rows;
  await db.exec(`reset role`);
  const tagged = rows.find((r) => r.id === photo);
  console.assert(rows.length === 2 && rows.some((r) => r.id === second), `galeri venue publik berisi foto activity ${rows.length}`);
  console.assert(tagged?.caption === "Tos!" && tagged.session_title === "Mabar Galeri" && tagged.members[0].first_name === "Felisya" && tagged.members[0].instagram === "felisyafernanda" && !("email" in tagged.members[0]), `tag publik hanya nama depan & IG ${JSON.stringify(tagged)}`);
  console.log("✓ galeri foto: per activity (album otomatis tayang), hanya admin konten, activity harus sudah berlangsung, tag hanya peserta (tag lama aman saat edit), caption, cover pindah saat dihapus, galeri venue publik");
}
