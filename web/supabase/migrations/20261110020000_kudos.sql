-- Kudos (BR-23, draft v1 10 Nov 2026): apresiasi anonim antar-peserta setelah sesi diakhiri.
--  · Pemberi: peserta hadir (booking 'attended' = check-in tidak dibatalkan) atau host sesi (role host),
--    juga host yang tidak ikut main. Fotografer, admin & peserta yang tidak hadir tidak bisa memberi.
--  · Penerima: peserta hadir lain (semua kategori) + host yang tidak ikut main (hanya grup Sikap).
--  · 1 kudos per pemberi per penerima per sesi; bisa diganti / dibatalkan sampai 21×24 jam (3 minggu) sejak sesi
--    diakhiri. Spec BR-23 menyebut 7 hari; user memintanya 3 minggu untuk sementara (10 Nov) — ubah di
--    kudos_window_closes_at + KUDOS_WINDOW_DAYS (web/src/lib/kudos.ts), dicek sama di check-migrations.
--  · Slay Point: +1 untuk pemberi per kudos (ganti kategori = tetap; batal / dihapus admin / sistem = −1).
--  · Anonim: member tidak pernah membaca tabel kudos (RLS tanpa policy member) — hanya lewat RPC yang
--    tidak mengembalikan pemberi. Admin Activities membaca semua & menghapus dengan alasan (tercatat di log).
--  · Check-in dibatalkan → kudos dari / ke orang itu di sesi itu dihapus otomatis, poin pemberi ditarik.
-- Notifikasi K-9 belum dibuat: belum ada sistem notifikasi in-app untuk member. Jumlah di profil tetap
-- mengikuti jadwal ringkasan harian (20.00 WIB) lewat kudos_visible_until, supaya waktunya tidak membocorkan pemberi.

-- ═══ Kategori (data, bukan hard-code) ═══════════════════════════════════════
create table kudos_categories (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label       text not null,
  "group"     text not null check ("group" in ('skill', 'attitude')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger kudos_categories_updated_at before update on kudos_categories for each row execute function set_updated_at();

insert into kudos_categories (key, label, "group", sort_order) values
  ('serve', 'Serve', 'skill', 10),
  ('second_serve', 'Second serve', 'skill', 20),
  ('forehand', 'Forehand', 'skill', 30),
  ('backhand', 'Backhand', 'skill', 40),
  ('slice', 'Slice', 'skill', 50),
  ('return', 'Return', 'skill', 60),
  ('drop_shot', 'Drop shot', 'skill', 70),
  ('volley', 'Volley', 'skill', 80),
  ('lob', 'Lob', 'skill', 90),
  ('overhead', 'Overhead', 'skill', 100),
  ('passing_shot', 'Passing shot', 'skill', 110),
  ('footwork', 'Footwork', 'skill', 120),
  ('consistency', 'Consistency', 'skill', 130),
  ('positivity', 'Positivity', 'attitude', 210),
  ('teamwork', 'Teamwork', 'attitude', 220),
  ('fair_play', 'Fair play', 'attitude', 230),
  ('strategy', 'Strategy', 'attitude', 240),
  ('patience', 'Patience', 'attitude', 250),
  ('entertainer', 'Entertainer', 'attitude', 260),
  ('cheerleader', 'Cheerleader', 'attitude', 270),
  ('organiser', 'Organiser', 'attitude', 280),
  ('style', 'Style', 'attitude', 290);

alter table kudos_categories enable row level security;
create policy "member read kudos categories" on kudos_categories for select to authenticated using (true);
create policy "admin manage kudos categories" on kudos_categories for all using (has_permission('settings', 'edit')) with check (has_permission('settings', 'edit'));

-- ═══ Kudos ═════════════════════════════════════════════════════════════════
create table kudos (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references sessions(id) on delete cascade,
  -- Akun pemberi dihapus → null (dianonimkan); kudos-nya tetap terhitung di agregat penerima (K-11).
  giver_member_id    uuid references profiles(id) on delete set null,
  receiver_member_id uuid not null references profiles(id) on delete cascade,
  receiver_role      text not null check (receiver_role in ('participant', 'host')),
  category_key       text not null references kudos_categories(key),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users(id) on delete set null,
  deleted_reason     text,
  deleted_source     text check (deleted_source in ('giver', 'admin', 'system')),
  check (giver_member_id is distinct from receiver_member_id),
  check ((deleted_at is null) = (deleted_source is null))
);
-- Maks. 1 kudos aktif per pemberi per penerima per sesi (simpan dua kali / dua perangkat → satu baris).
create unique index kudos_one_per_pair on kudos (session_id, giver_member_id, receiver_member_id) where deleted_at is null;
create index kudos_receiver_idx on kudos (receiver_member_id) where deleted_at is null;
create index kudos_session_idx on kudos (session_id);
create trigger kudos_updated_at before update on kudos for each row execute function set_updated_at();

-- RLS tanpa policy member: member tidak bisa membaca siapa memberi kudos (hanya lewat RPC di bawah).
alter table kudos enable row level security;
create policy "admin read kudos" on kudos for select using (has_permission('activities', 'view'));
revoke insert, update, delete on kudos from anon, authenticated;

-- Poin kudos: +1 saat diberi, −1 saat dibatalkan / dihapus — masing-masing sekali per kudos.
-- Tanpa FK: hapus activity (cascade ke kudos & set null session_id di baris yang sama) bentrok dengan FK
-- kedua di baris itu; kudos memang tidak pernah dihapus permanen kecuali bersama activity-nya.
alter table points_ledger add column kudos_id uuid;
create unique index points_kudos_given_once on points_ledger (kudos_id) where kudos_id is not null and delta > 0;
create unique index points_kudos_revoked_once on points_ledger (kudos_id) where kudos_id is not null and delta < 0;

-- ═══ Aturan (dipakai semua RPC) ════════════════════════════════════════════

/** Batas jendela kudos sesi ini (3 minggu sejak diakhiri / ditutup otomatis); null = belum diakhiri atau dibatalkan. */
create function kudos_window_closes_at(p_session uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(s.ended_at, session_closes_at(s.ends_at)) + interval '21 days' -- = KUDOS_WINDOW_DAYS
  from sessions s
  where s.id = p_session
    and s.status in ('published', 'completed')
    and (s.ended_at is not null or s.status = 'completed' or session_closes_at(s.ends_at) <= now());
$$;

/** Peran member di kudos sesi ini: 'participant' (hadir), 'host' (host yang tidak ikut main), null = tidak ikut. */
create function kudos_role(p_session uuid, p_member uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from bookings b where b.session_id = p_session and b.member_id = p_member and b.status = 'attended') then 'participant'
    when exists (select 1 from session_hosts h where h.session_id = p_session and h.member_id = p_member and h.role = 'host') then 'host'
  end;
$$;

/** Tarik kudos (soft delete) + poin pemberi −1 (sekali). Dipakai batal pemberi, hapus admin & hapus otomatis. */
create function kudos_revoke(p_kudos uuid, p_source text, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_k kudos%rowtype;
  v_title text;
begin
  update kudos
  set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = p_reason, deleted_source = p_source
  where id = p_kudos and deleted_at is null
  returning * into v_k;
  if not found then return false; end if;
  if v_k.giver_member_id is not null
     and exists (select 1 from points_ledger where kudos_id = v_k.id and delta > 0)
     and not exists (select 1 from points_ledger where kudos_id = v_k.id and delta < 0) then
    select title into v_title from sessions where id = v_k.session_id;
    insert into points_ledger (member_id, delta, reason, booking_id, session_id, kudos_id, note, created_by)
    values (v_k.giver_member_id, -1, 'bonus',
            (select id from bookings where session_id = v_k.session_id and member_id = v_k.giver_member_id),
            v_k.session_id, v_k.id,
            format('Kudos %s · %s', case p_source when 'giver' then 'dibatalkan' else 'dihapus' end, v_title),
            (select user_id from staff_members where user_id = auth.uid()));
  end if;
  return true;
end $$;

-- ═══ RPC member ═══════════════════════════════════════════════════════════

/**
 * Bagian kudos halaman sesi selesai untuk pemberi yang eligible: daftar penerima + kudos yang SAYA berikan.
 * null = bukan pemberi eligible / sesi belum diakhiri. Tidak pernah memuat kudos orang lain.
 */
create function session_kudos(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_closes timestamptz := kudos_window_closes_at(p_session);
  v_me uuid := auth.uid();
begin
  if v_me is null or v_closes is null or kudos_role(p_session, v_me) is null then return null; end if;
  return jsonb_build_object(
    'window_closes_at', v_closes,
    'can_edit', now() <= v_closes,
    'receivers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', r.member_id, 'name', p.full_name, 'avatar', p.avatar_path, 'role', r.role,
               'category_key', k.category_key)
             order by r.role desc, p.full_name)
      from (
        select b.member_id, 'participant' as role from bookings b
        where b.session_id = p_session and b.status = 'attended'
        union
        select h.member_id, 'host' from session_hosts h
        where h.session_id = p_session and h.role = 'host'
          and not exists (select 1 from bookings b where b.session_id = p_session and b.member_id = h.member_id and b.status = 'attended')
      ) r
      join profiles p on p.id = r.member_id
      left join kudos k on k.session_id = p_session and k.giver_member_id = v_me and k.receiver_member_id = r.member_id and k.deleted_at is null
      where r.member_id <> v_me
    ), '[]'::jsonb)
  );
end $$;

/**
 * Beri / ganti kudos (idempotent). Kode error = status HTTP lewat PostgREST:
 * PT409 jendela tutup · PT403 bukan pemberi eligible · PT422 diri sendiri / kategori tidak valid /
 * kategori Skill untuk host · PT404 penerima bukan peserta hadir.
 */
create function give_kudos(p_session uuid, p_receiver uuid, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_closes timestamptz := kudos_window_closes_at(p_session);
  v_role text;
  v_group text;
  v_id uuid;
  v_new boolean;
  v_title text;
begin
  if v_closes is null then raise exception 'Kudos dibuka setelah sesi diakhiri' using errcode = 'PT409'; end if;
  if now() > v_closes then raise exception 'Masa kasih kudos sudah berakhir' using errcode = 'PT409'; end if;
  if v_me is null or kudos_role(p_session, v_me) is null then
    raise exception 'Hanya peserta hadir atau host sesi ini yang bisa memberi kudos' using errcode = 'PT403';
  end if;
  if p_receiver = v_me then raise exception 'Tidak bisa memberi kudos ke diri sendiri' using errcode = 'PT422'; end if;
  v_role := kudos_role(p_session, p_receiver);
  if v_role is null then raise exception 'Penerima bukan peserta hadir sesi ini' using errcode = 'PT404'; end if;
  select "group" into v_group from kudos_categories where key = p_category and is_active;
  if v_group is null then raise exception 'Kategori kudos tidak valid' using errcode = 'PT422'; end if;
  if v_role = 'host' and v_group <> 'attitude' then
    raise exception 'Host yang tidak ikut main hanya bisa menerima kudos Sikap' using errcode = 'PT422';
  end if;

  -- xmax = 0 → baris baru: poin hanya untuk kudos baru (aman dari kiriman bersamaan).
  insert into kudos (session_id, giver_member_id, receiver_member_id, receiver_role, category_key)
  values (p_session, v_me, p_receiver, v_role, p_category)
  on conflict (session_id, giver_member_id, receiver_member_id) where deleted_at is null
  do update set category_key = excluded.category_key, receiver_role = excluded.receiver_role
  returning id, (xmax = 0) into v_id, v_new;

  if v_new then
    select title into v_title from sessions where id = p_session;
    insert into points_ledger (member_id, delta, reason, booking_id, session_id, kudos_id, note)
    values (v_me, 1, 'bonus', (select id from bookings where session_id = p_session and member_id = v_me), p_session, v_id,
            format('Kudos · %s', v_title));
  end if;
  return jsonb_build_object('id', v_id, 'category_key', p_category, 'created', v_new);
end $$;

/** Batalkan kudos saya ke penerima ini (poin −1). Tidak ada kudos → tidak apa-apa (idempotent). */
create function cancel_kudos(p_session uuid, p_receiver uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_closes timestamptz := kudos_window_closes_at(p_session);
  v_id uuid;
begin
  if v_closes is null then raise exception 'Kudos dibuka setelah sesi diakhiri' using errcode = 'PT409'; end if;
  if now() > v_closes then raise exception 'Masa kasih kudos sudah berakhir' using errcode = 'PT409'; end if;
  if v_me is null or kudos_role(p_session, v_me) is null then
    raise exception 'Hanya peserta hadir atau host sesi ini yang bisa memberi kudos' using errcode = 'PT403';
  end if;
  select id into v_id from kudos
  where session_id = p_session and giver_member_id = v_me and receiver_member_id = p_receiver and deleted_at is null;
  if v_id is null then return false; end if;
  return kudos_revoke(v_id, 'giver', null);
end $$;

/**
 * Batas waktu kudos yang sudah boleh terlihat di profil: ringkasan harian terakhir (20.00 WIB, K-9 / KD-3).
 * Jumlah di profil hanya berubah sekali sehari, supaya waktu kudos bertambah tidak membocorkan pemberinya
 * (K-7). Pengaturan app.kudos_no_delay = on (hanya bisa di sesi database langsung, mis. tes) → tanpa jeda.
 */
create function kudos_visible_until() returns timestamptz
language sql stable set search_path = public as $$
  select case when coalesce(nullif(current_setting('app.kudos_no_delay', true), ''), 'off') = 'on' then now()
              else (date_trunc('day', (now() at time zone 'Asia/Jakarta') - interval '20 hours') + interval '20 hours') at time zone 'Asia/Jakarta'
         end;
$$;

/**
 * Agregat kudos seorang member (profil): total, jumlah pemberi, per kategori (semua kategori aktif + kategori
 * nonaktif yang pernah diterima). Tanpa data pemberi. Urutan: jumlah terbanyak → yang terbaru diterima.
 * Waktu diterima sengaja tidak dikirim (hanya urutannya) — jam persis bisa membocorkan pemberi (K-7).
 */
create function member_kudos(p_member uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with target as (select coalesce(p_member, auth.uid()) as id),
  mine as (
    select k.category_key, k.giver_member_id, k.id, k.created_at
    from kudos k, target t
    where k.receiver_member_id = t.id and k.deleted_at is null
      -- Kudos baru / diganti sesudah ringkasan harian terakhir baru terlihat di ringkasan berikutnya.
      and k.updated_at <= kudos_visible_until()
  ),
  per as (
    select c.key, c.label, c."group", c.sort_order, count(m.id)::int as n, max(m.created_at) as last_at
    from kudos_categories c
    left join mine m on m.category_key = c.key
    group by c.key
    having c.is_active or count(m.id) > 0
  )
  select case when auth.uid() is null then null else jsonb_build_object(
    'total', (select count(*)::int from mine),
    -- Pemberi yang akunnya dihapus (null) dihitung per kudos.
    'unique_givers', (select count(distinct coalesce(giver_member_id, id))::int from mine),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'group', "group", 'count', n)
             order by n desc, last_at desc nulls last, sort_order)
      from per), '[]'::jsonb)
  ) end;
$$;

/** Chip "kudos teratas" per peserta untuk host & admin (menyusun line-up): agregat 6 bulan terakhir, tanpa pemberi. */
create function session_kudos_top(p_session uuid)
returns table (member_id uuid, category_key text, label text, count integer)
language sql stable security definer set search_path = public as $$
  select distinct on (k.receiver_member_id) k.receiver_member_id, k.category_key, c.label, count(*)::int
  from kudos k
  join kudos_categories c on c.key = k.category_key
  where k.deleted_at is null
    -- 6 bulan terakhir (= KUDOS_TOP_DAYS di web/src/lib/kudos.ts): kekuatan pemain sekarang, bukan setahun lalu.
    and k.created_at > now() - interval '180 days'
    and k.receiver_member_id in (
      select b.member_id from bookings b where b.session_id = p_session and b.status <> 'cancelled'
      union
      select sp.member_id from session_participants sp where sp.session_id = p_session and sp.member_id is not null)
    and (select is_assigned_host(p_session) or has_permission('activities', 'view'))
  group by k.receiver_member_id, k.category_key, c.label
  order by k.receiver_member_id, count(*) desc, max(k.created_at) desc;
$$;

-- ═══ RPC admin ════════════════════════════════════════════════════════════

/** Hapus kudos (soft delete) dengan alasan wajib: poin pemberi −1, tercatat di admin_audit_log. */
create function admin_delete_kudos(p_kudos uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_k kudos%rowtype;
begin
  if not has_permission('activities', 'edit') then raise exception 'Hanya admin yang bisa menghapus kudos' using errcode = 'PT403'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Alasan hapus wajib diisi' using errcode = 'PT422'; end if;
  select * into v_k from kudos where id = p_kudos;
  if not found then raise exception 'Kudos tidak ditemukan' using errcode = 'PT404'; end if;
  if not kudos_revoke(p_kudos, 'admin', btrim(p_reason)) then raise exception 'Kudos sudah dihapus' using errcode = 'PT409'; end if;
  insert into admin_audit_log (actor_id, action, entity_type, entity_id)
  values ((select user_id from staff_members where user_id = auth.uid()),
          format('menghapus kudos %s dari %s ke %s (sesi %s, diberi %s) · alasan: %s', v_k.category_key,
                 coalesce((select full_name from profiles where id = v_k.giver_member_id), 'akun terhapus'),
                 coalesce((select full_name from profiles where id = v_k.receiver_member_id), 'member'),
                 coalesce((select title from sessions where id = v_k.session_id), v_k.session_id::text),
                 to_char(v_k.created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), btrim(p_reason)),
          'kudos', v_k.id::text);
end $$;

-- ═══ Check-in dibatalkan → kudos dari / ke orang itu dihapus otomatis (K-11) ═══
create function kudos_on_attendance_undone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_k record;
begin
  for v_k in
    select id, category_key, giver_member_id, receiver_member_id from kudos
    where session_id = new.session_id and deleted_at is null
      and (giver_member_id = new.member_id or receiver_member_id = new.member_id)
  loop
    if kudos_revoke(v_k.id, 'system', 'Check-in dibatalkan') then
      insert into admin_audit_log (actor_id, action, entity_type, entity_id)
      values ((select user_id from staff_members where user_id = auth.uid()),
              format('kudos %s otomatis dihapus (check-in %s dibatalkan)', v_k.category_key,
                     coalesce((select full_name from profiles where id = new.member_id), 'member')),
              'kudos', v_k.id::text);
    end if;
  end loop;
  return null;
end $$;
create trigger bookings_kudos_attendance_undone after update of status on bookings
  for each row when (old.status = 'attended' and new.status <> 'attended')
  execute function kudos_on_attendance_undone();

-- ═══ Hak eksekusi ═══════════════════════════════════════════════════════════
-- Default privileges Supabase memberi EXECUTE ke anon & authenticated → cabut, lalu beri yang dipanggil member.
revoke execute on function kudos_window_closes_at(uuid) from public, anon, authenticated;
revoke execute on function kudos_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function kudos_visible_until() from public, anon, authenticated;
revoke execute on function kudos_revoke(uuid, text, text) from public, anon, authenticated;
revoke execute on function kudos_on_attendance_undone() from public, anon, authenticated;
revoke execute on function session_kudos(uuid) from public, anon;
revoke execute on function give_kudos(uuid, uuid, text) from public, anon;
revoke execute on function cancel_kudos(uuid, uuid) from public, anon;
revoke execute on function member_kudos(uuid) from public, anon;
revoke execute on function session_kudos_top(uuid) from public, anon;
revoke execute on function admin_delete_kudos(uuid, text) from public, anon;
grant execute on function session_kudos(uuid) to authenticated;
grant execute on function give_kudos(uuid, uuid, text) to authenticated;
grant execute on function cancel_kudos(uuid, uuid) to authenticated;
grant execute on function member_kudos(uuid) to authenticated;
grant execute on function session_kudos_top(uuid) to authenticated;
grant execute on function admin_delete_kudos(uuid, text) to authenticated;

-- ═══ Kartu peserta (klik nama di tab Peserta) ════════════════════════════════
/**
 * Ringkasan satu peserta untuk sesama peserta / host / admin sesi itu: jumlah sesi yang pernah dihadiri di
 * Soslay + kudos (total, jumlah pemberi, 3 kategori teratas). Tanpa kontak & tanpa pemberi kudos.
 * p_person = id roster (session_participants.id, atau member_id untuk booking website tanpa baris peserta).
 * null = peserta tamu tanpa akun Soslay / bukan peserta sesi ini / pemanggil tidak berhak.
 */
create function session_person_card(p_session uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_member uuid;
  v_kudos jsonb;
begin
  if not (is_session_member(p_session) or is_assigned_host(p_session) or has_permission('activities', 'view')) then return null; end if;
  select member_id into v_member from session_participants where id = p_person and session_id = p_session;
  if v_member is null then
    select member_id into v_member from bookings where session_id = p_session and member_id = p_person and status <> 'cancelled';
  end if;
  if v_member is null then return null; end if;
  v_kudos := member_kudos(v_member);
  return jsonb_build_object(
    'sessions_attended', (select count(distinct session_id)::int from bookings where member_id = v_member and status = 'attended'),
    'kudos_total', v_kudos -> 'total',
    'kudos_givers', v_kudos -> 'unique_givers',
    'kudos_top', coalesce((select jsonb_agg(c) from (
        select jsonb_build_object('label', e ->> 'label', 'count', (e ->> 'count')::int) c
        from jsonb_array_elements(v_kudos -> 'categories') with ordinality as t(e, n)
        where (e ->> 'count')::int > 0
        order by n limit 3) top), '[]'::jsonb));
end $$;
revoke execute on function session_person_card(uuid, uuid) from public, anon;
grant execute on function session_person_card(uuid, uuid) to authenticated;

-- ═══ Sinkron peserta tidak menurunkan status hadir ══════════════════════════
-- Sama dengan versi 20261105020000_active_staff_rule, kecuali: booking 'attended' hanya turun ke 'registered'
-- bila check-in baris peserta itu benar-benar DIBATALKAN (update checked_in_at terisi → null). Baris peserta
-- baru / ditautkan ulang tanpa check-in (impor ulang Kuyy, tambahan admin sesudah sesi) tidak lagi
-- membatalkan kehadiran — dulu ikut menarik poin hadir dan sekarang juga akan menghapus kudos (K-11).
create or replace function session_participant_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_undo boolean := false;
begin
  if new.member_id is null then
    return new;
  end if;
  insert into bookings (session_id, member_id, status, payment_status, source, amount)
  values (new.session_id, new.member_id, 'registered', 'paid', (case when new.source = 'admin' then 'admin' else 'kuy' end)::booking_source, new.amount)
  on conflict (session_id, member_id) do nothing;
  if tg_op = 'UPDATE' then
    v_undo := old.checked_in_at is not null and new.checked_in_at is null and new.member_id is not distinct from old.member_id;
  end if;
  if tg_op = 'INSERT' or new.checked_in_at is distinct from old.checked_in_at or new.member_id is distinct from old.member_id then
    update bookings
    set status = case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end,
        checked_in_at = new.checked_in_at,
        checked_in_by = case when is_active_staff(new.checked_in_by) then new.checked_in_by end
    where session_id = new.session_id and member_id = new.member_id
      and (status <> 'cancelled' or (new.checked_in_at is not null and can_revive_booking(new.session_id, new.member_id, new.checked_in_by)))
      and (status <> 'attended' or new.checked_in_at is not null or v_undo)
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;
revoke execute on function session_participant_sync() from public, anon, authenticated;
