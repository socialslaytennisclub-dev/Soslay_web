-- Format pertandingan sesi (Americano), peserta hasil import Kuyy, host per sesi, dan line-up.
--
-- Keputusan v1:
-- - Peserta diverifikasi manual: admin mengimpor export XLSX Kuyy → session_participants
--   (bisa tamu tanpa akun). Peserta yang cocok dengan member (email/telepon) ikut tercatat
--   di bookings supaya riwayat & Slay Point member tetap jalan.
-- - Skor hanya diisi host/admin (score_entry = 'host'); format yang dipakai: Americano & Rotating Partner.
-- - Host = member biasa yang ditunjuk per sesi. Haknya hanya untuk sesi itu dan otomatis
--   berakhir saat sesi diakhiri (ended_at) / selesai / dibatalkan — setelah itu kembali member.
-- - Ronde tidak dibatasi waktu: match selesai saat total poin = target_points.

-- rotating = Rotating Partner: partner berganti tiap ronde seperti Americano, tim diseimbangkan per level.
create type match_format as enum ('none', 'americano', 'rotating', 'round_robin', 'knockout');
create type score_entry  as enum ('host', 'participants');
-- Peringkat leaderboard: total poin (Point) atau jumlah menang (Win).
create type leaderboard_mode as enum ('points', 'wins');

alter table sessions
  add column match_format          match_format not null default 'none',
  add column court_count           smallint not null default 2  check (court_count between 1 and 12),
  add column round_count           smallint not null default 9  check (round_count between 1 and 40),
  add column target_points         smallint not null default 21 check (target_points between 1 and 99),
  add column score_entry           score_entry not null default 'host',
  add column leaderboard_mode      leaderboard_mode not null default 'points',
  add column show_live_leaderboard boolean not null default true,
  add column live_started_at       timestamptz,
  add column current_round         smallint,
  add column ended_at              timestamptz;

-- ═══ Peserta (import Kuyy) ═════════════════════════════════════════════════
create table session_participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  member_id      uuid references profiles(id) on delete set null,   -- cocok dengan member Soslay
  full_name      text not null,
  email          citext,
  phone          text,                                             -- tanpa +62, sama seperti profiles
  instagram      citext,
  tennis_level   tennis_level,
  kuy_username   citext,                                           -- akun Kuyy pembeli tiket
  kuy_reg_no     text,                                             -- "U1", "U2", … per event
  amount         integer not null default 0,
  payment_method text,
  checked_in_at  timestamptz,
  checked_in_by  uuid references auth.users(id) on delete set null,
  imported_at    timestamptz not null default now(),
  unique (session_id, kuy_reg_no)
);
create index session_participants_session_idx on session_participants (session_id);
create index session_participants_member_idx  on session_participants (member_id) where member_id is not null;

-- ═══ Host per sesi ═════════════════════════════════════════════════════════
create table session_hosts (
  session_id  uuid not null references sessions(id) on delete cascade,
  member_id   uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
create index session_hosts_member_idx on session_hosts (member_id);

/** Host aktif = ditunjuk di sesi ini dan sesinya belum diakhiri/selesai/dibatalkan. */
create function is_session_host(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from session_hosts h
    join sessions s on s.id = h.session_id
    where h.session_id = p_session
      and h.member_id = auth.uid()
      and s.ended_at is null
      and s.status in ('draft', 'published')
  );
$$;

-- ═══ Line-up & skor ════════════════════════════════════════════════════════
create table session_matches (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_no   smallint not null check (round_no > 0),
  court_no   smallint not null check (court_no > 0),
  a1         uuid not null references session_participants(id) on delete cascade,
  a2         uuid not null references session_participants(id) on delete cascade,
  b1         uuid not null references session_participants(id) on delete cascade,
  b2         uuid not null references session_participants(id) on delete cascade,
  score_a    smallint check (score_a >= 0),
  score_b    smallint check (score_b >= 0),
  scored_by  uuid references auth.users(id) on delete set null,
  scored_at  timestamptz,
  unique (session_id, round_no, court_no),
  check (a1 <> a2 and a1 <> b1 and a1 <> b2 and a2 <> b1 and a2 <> b2 and b1 <> b2),
  check ((score_a is null) = (score_b is null))
);
create index session_matches_session_idx on session_matches (session_id, round_no);

-- Peserta yang cocok dengan member → booking Kuyy (riwayat member). Check-in peserta →
-- status booking ikut berubah, jadi trigger poin kehadiran yang sudah ada tetap berlaku.
create function session_participant_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is null then
    return new;
  end if;
  insert into bookings (session_id, member_id, status, payment_status, source, amount)
  values (new.session_id, new.member_id, 'registered', 'paid', 'kuy', new.amount)
  on conflict (session_id, member_id) do nothing;
  if tg_op = 'INSERT' or new.checked_in_at is distinct from old.checked_in_at or new.member_id is distinct from old.member_id then
    update bookings
    set status = case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end,
        checked_in_at = new.checked_in_at,
        checked_in_by = case when new.checked_in_by is not null and exists (select 1 from staff_members where user_id = new.checked_in_by) then new.checked_in_by end
    where session_id = new.session_id and member_id = new.member_id and status <> 'cancelled'
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;
create trigger session_participants_sync after insert or update on session_participants
  for each row execute function session_participant_sync();

-- ═══ Aksi host (RPC) ═══════════════════════════════════════════════════════
-- Host tidak dapat izin tulis tabel; semua lewat fungsi yang mengecek is_session_host().

create function can_run_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission('activities', 'edit') or is_session_host(p_session);
$$;

create function set_participant_check_in(p_participant uuid, p_checked_in boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
begin
  select session_id into v_session from session_participants where id = p_participant;
  if v_session is null then raise exception 'Peserta tidak ditemukan'; end if;
  if not can_run_session(v_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  update session_participants
  set checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end,
      checked_in_by = case when p_checked_in then auth.uid() end
  where id = p_participant;
end $$;

/** Simpan skor match. Total harus = target poin sesi; skor dari host langsung final. */
create function save_match_score(p_match uuid, p_score_a smallint, p_score_b smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_target smallint;
  v_ended timestamptz;
begin
  select m.session_id, s.target_points, s.ended_at into v_session, v_target, v_ended
  from session_matches m join sessions s on s.id = m.session_id where m.id = p_match;
  if v_session is null then raise exception 'Match tidak ditemukan'; end if;
  if not can_run_session(v_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_ended is not null and not has_permission('settings', 'edit') then raise exception 'Sesi sudah diakhiri — skor terkunci'; end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 or p_score_a + p_score_b <> v_target then
    raise exception 'Total poin harus %', v_target;
  end if;
  update session_matches
  set score_a = p_score_a, score_b = p_score_b, scored_by = auth.uid(), scored_at = now()
  where id = p_match;
end $$;

revoke execute on function is_session_host(uuid) from anon;
revoke execute on function can_run_session(uuid) from anon;
revoke execute on function set_participant_check_in(uuid, boolean) from anon;
revoke execute on function save_match_score(uuid, smallint, smallint) from anon;

-- ═══ RLS ═══════════════════════════════════════════════════════════════════
alter table session_participants enable row level security;
alter table session_hosts        enable row level security;
alter table session_matches      enable row level security;

create policy "read session participants" on session_participants for select using (
  (select has_permission('activities')) or member_id = (select auth.uid()) or is_session_host(session_id)
);
create policy "admin write participants"  on session_participants for all
  using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

create policy "read session hosts" on session_hosts for select using (
  (select has_permission('activities')) or member_id = (select auth.uid())
);
create policy "admin write hosts"  on session_hosts for all
  using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

-- Line-up & skor terlihat oleh tim, host, dan peserta sesi itu sendiri.
create policy "read session matches" on session_matches for select using (
  (select has_permission('activities'))
  or is_session_host(session_id)
  or exists (select 1 from session_participants p where p.session_id = session_matches.session_id and p.member_id = (select auth.uid()))
);
create policy "admin write matches"  on session_matches for all
  using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));
