-- Schema "app": data khusus app SOSLAY (iOS). Web & app memakai SATU project Supabase.
--   public  = data bersama (profiles, sessions, bookings, poin, tier) — tetap milik web.
--   app     = tabel khusus app + VIEW ke data bersama. App HANYA membaca lewat schema ini,
--             jadi perubahan struktur tabel public cukup disesuaikan di view, app tidak rusak.
-- Setelah apply: Dashboard → Project Settings → API → Exposed schemas → tambahkan "app".

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ═══ View ke data bersama (security_invoker → RLS tabel public tetap berlaku) ═══

create view app.my_profile with (security_invoker = true) as
  select id, member_code, full_name, display_name, city, avatar_path, tier, joined_at
  from public.profiles
  where id = auth.uid();

create view app.my_points with (security_invoker = true) as
  select member_id, points_balance, points_earned, sessions_attended, hours_played, last_played_at
  from public.member_stats
  where member_id = auth.uid();

create view app.tiers with (security_invoker = true) as
  select tier, label, min_points, sort_order from public.membership_tiers;

-- Activity Social Slay yang diikuti member (untuk tautan video & riwayat main).
create view app.my_sessions with (security_invoker = true) as
  select s.id as session_id, s.title, s.starts_at, v.name as venue, b.status
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  left join public.venues v on v.id = s.venue_id
  where b.member_id = auth.uid() and b.status <> 'cancelled';

-- ═══ Tabel khusus app ═══
-- Video TIDAK PERNAH diunggah: server hanya menyimpan tautan (id aset di galeri HP).

create table app.activities (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  kind       text not null check (kind in ('mabar', 'sparring', 'match')),
  venue      text not null default '',
  starts_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index activities_owner_idx on app.activities (owner_id, starts_at desc);

create table app.matches (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references app.activities(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  court        text not null default '',
  team_a       text not null,
  team_b       text not null,
  format       jsonb not null,                 -- { sets: 1|3, games: 4|6, noAd: bool }
  first_server text not null check (first_server in ('A', 'B')),
  points       text[] not null default '{}',   -- urutan poin 'A'/'B'; skor dihitung ulang di app
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index matches_owner_idx on app.matches (owner_id);
create index matches_activity_idx on app.matches (activity_id);

create table app.video_links (
  owner_id        uuid not null references auth.users(id) on delete cascade,
  device_asset_id text not null,
  activity_id     uuid references app.activities(id) on delete set null,
  session_id      uuid references public.sessions(id) on delete set null,
  duration_sec    int not null default 0,
  created_at      timestamptz not null default now(),
  primary key (owner_id, device_asset_id)
);

alter table app.activities  enable row level security;
alter table app.matches     enable row level security;
alter table app.video_links enable row level security;

create policy "own activities"  on app.activities  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own matches"     on app.matches     for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own video links" on app.video_links for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on app.activities, app.matches, app.video_links to authenticated;
grant select on app.my_profile, app.my_points, app.tiers, app.my_sessions to authenticated;

-- ═══ Verifikasi penjual Slay Select ═══
-- Syarat: foto profil + nomor HP terverifikasi OTP (Supabase Auth phone, kanal WhatsApp) + alamat.
-- Nomor & alamat HANYA untuk admin (has_permission 'members'). Profil publik hanya nama, kota, badge.

create type app.seller_status as enum ('pending', 'approved', 'rejected');

create table app.seller_verifications (
  member_id     uuid primary key references public.profiles(id) on delete cascade,
  phone         text not null,          -- disalin dari auth.users.phone saat submit
  address       text not null check (char_length(address) between 5 and 300),
  city          text not null check (char_length(city) between 2 and 80),
  postal_code   text not null default '',
  status        app.seller_status not null default 'pending',
  reject_reason text,
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz
);
create index seller_verifications_status_idx on app.seller_verifications (status, submitted_at);

alter table app.seller_verifications enable row level security;
-- Member hanya bisa MEMBACA datanya sendiri; menulis lewat fungsi di bawah.
create policy "own verification read" on app.seller_verifications for select to authenticated
  using (member_id = (select auth.uid()) or public.has_permission('members'));
create policy "staff review" on app.seller_verifications for update to authenticated
  using (public.has_permission('members', 'edit'))
  with check (public.has_permission('members', 'edit'));
grant select, update on app.seller_verifications to authenticated;

-- Kirim / kirim ulang verifikasi. Selalu kembali ke status 'pending'.
create function app.submit_seller_verification(p_address text, p_city text, p_postal_code text default '')
returns app.seller_status language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select phone into v_phone from auth.users where id = v_uid and phone_confirmed_at is not null;
  if v_phone is null then raise exception 'phone_not_verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and avatar_path is not null) then
    raise exception 'avatar_required';
  end if;
  insert into app.seller_verifications as sv (member_id, phone, address, city, postal_code)
  values (v_uid, v_phone, p_address, p_city, coalesce(p_postal_code, ''))
  on conflict (member_id) do update
    set phone = excluded.phone, address = excluded.address, city = excluded.city,
        postal_code = excluded.postal_code, status = 'pending', reject_reason = null,
        submitted_at = now(), reviewed_by = null, reviewed_at = null;
  return 'pending';
end $$;

-- Hapus data verifikasi sendiri (Profil › Privasi). Badge penjual ikut hilang.
create function app.delete_my_seller_verification()
returns void language sql security definer set search_path = '' as $$
  delete from app.seller_verifications where member_id = auth.uid();
$$;

-- Profil penjual publik: TANPA nomor & alamat lengkap.
create function app.seller_profile(p_member uuid)
returns table (member_id uuid, display_name text, avatar_path text, tier public.member_tier,
               city text, verified_since timestamptz, sessions_attended bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.display_name, p.full_name), p.avatar_path, p.tier,
         sv.city, sv.reviewed_at,
         (select count(*) from public.bookings b where b.member_id = p.id and b.status = 'attended')
  from app.seller_verifications sv
  join public.profiles p on p.id = sv.member_id
  where sv.member_id = p_member and sv.status = 'approved';
$$;

revoke execute on function app.submit_seller_verification(text, text, text) from public, anon;
revoke execute on function app.delete_my_seller_verification() from public, anon;
revoke execute on function app.seller_profile(uuid) from public, anon;
grant execute on function app.submit_seller_verification(text, text, text) to authenticated;
grant execute on function app.delete_my_seller_verification() to authenticated;
grant execute on function app.seller_profile(uuid) to authenticated;
