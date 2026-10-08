-- ═══════════════════════════════════════════════════════════════════════════
-- Soslay — schema awal (Supabase / Postgres 15+)
--
-- Satu database melayani 3 permukaan:
--   1. Website publik      → sessions, venues, products, content (baca publik via RLS)
--   2. Member dashboard    → profiles, bookings, points_ledger, orders, photo_tags (baca/ubah milik sendiri)
--   3. Admin (CMS + CRM)   → semua tabel, dibatasi role_permissions per modul
--
-- Skala target: ±500–1.500 member, 100–200 aktif/bulan, ±10–20 sesi/minggu.
-- Di skala ini agregasi (statistik member, KPI) cukup lewat VIEW biasa + index yang tepat —
-- tidak perlu tabel ringkasan/denormalisasi. Lihat docs/04-DATABASE.md.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ── Enum ───────────────────────────────────────────────────────────────────
create type member_tier        as enum ('basic', 'silver', 'gold', 'platinum');
create type member_status      as enum ('active', 'inactive', 'suspended');
create type tennis_level       as enum ('beginner', 'beginner_intermediate', 'intermediate', 'intermediate_advanced', 'advanced');
create type play_frequency     as enum ('rarely', 'monthly', 'weekly', 'twice_weekly', 'often');
create type play_format        as enum ('singles', 'doubles', 'both');
create type dominant_hand      as enum ('right', 'left', 'both');
create type gender             as enum ('male', 'female', 'undisclosed');

create type session_status     as enum ('draft', 'published', 'cancelled', 'completed');
create type session_visibility as enum ('public', 'members', 'link');
create type crew_role          as enum ('host', 'coach', 'photographer');

create type booking_status     as enum ('registered', 'waitlisted', 'cancelled', 'attended', 'no_show');
create type payment_status     as enum ('pending', 'paid', 'failed', 'refunded');
create type booking_source     as enum ('website', 'kuy', 'admin');

create type points_reason      as enum ('attendance', 'purchase', 'redeem', 'adjustment', 'bonus');

create type product_category   as enum ('apparel', 'racket', 'accessory');
create type product_status     as enum ('draft', 'active', 'archived');
create type order_status       as enum ('pending', 'processing', 'shipped', 'completed', 'cancelled');

create type publish_status     as enum ('draft', 'published');
create type admin_module       as enum ('overview', 'members', 'activities', 'venues', 'products', 'orders', 'content', 'settings');
create type module_access      as enum ('none', 'view', 'edit');
create type staff_status       as enum ('invited', 'active', 'disabled');

-- ── Util: updated_at otomatis ─────────────────────────────────────────────
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ═══ Tim & akses ═══════════════════════════════════════════════════════════
create table roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,              -- "Super Admin", "Coach", "Kasir Shop", …
  is_system   boolean not null default false,    -- role bawaan tidak bisa dihapus
  created_at  timestamptz not null default now()
);

-- Matriks izin di Settings & Roles: satu baris per (role, modul).
create table role_permissions (
  role_id  uuid not null references roles(id) on delete cascade,
  module   admin_module not null,
  access   module_access not null default 'none',
  primary key (role_id, module)
);

-- Staf = user auth yang punya akses admin. Seorang staf juga boleh punya profil member.
create table staff_members (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  role_id         uuid not null references roles(id),
  full_name       text not null,
  email           citext not null unique,
  status          staff_status not null default 'invited',
  last_active_at  timestamptz,
  invited_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Cek izin dipakai oleh semua policy RLS admin. SECURITY DEFINER supaya bisa membaca
-- staff_members/role_permissions tanpa membuka tabel itu ke semua user.
create function has_permission(p_module admin_module, p_access module_access default 'view')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from staff_members s
    join role_permissions rp on rp.role_id = s.role_id and rp.module = p_module
    where s.user_id = auth.uid()
      and s.status = 'active'
      and (rp.access = 'edit' or (p_access = 'view' and rp.access = 'view'))
  );
$$;

-- ═══ Member (CRM) ══════════════════════════════════════════════════════════
create table membership_tiers (
  tier        member_tier primary key,
  label       text not null,
  min_points  integer not null check (min_points >= 0),   -- poin kumulatif (lifetime earned)
  sort_order  smallint not null
);

-- No. member "SOS 0067 2507": urutan + bulan/tahun bergabung (FR-AUTH-5).
create sequence member_number_seq start 1;

create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  member_code        text not null unique,
  full_name          text not null,
  display_name       text,
  email              citext not null unique,
  phone              text,                       -- tanpa +62, mis. "81234567890"
  city               text,
  birth_date         date,
  gender             gender,
  kuy_id             citext unique,
  reclub_id          citext unique,
  instagram          citext,
  avatar_path        text,                       -- storage: avatars/{id}.webp
  tier               member_tier not null default 'basic',
  status             member_status not null default 'active',
  -- Tennis profile
  tennis_level       tennis_level,
  play_frequency     play_frequency,
  play_format        play_format,
  dominant_hand      dominant_hand,
  playing_since      text,                       -- pilihan "1–3 tahun", dst.
  -- Community preferences (multi-select)
  looking_for        text[] not null default '{}',
  event_types        text[] not null default '{}',
  joined_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_tier_idx   on profiles (tier);
create index profiles_status_idx on profiles (status);
create index profiles_city_idx   on profiles (city);
create index profiles_joined_idx on profiles (joined_at desc);
-- Pencarian admin (nama, email, Kuy ID, Instagram) — trigram index cukup untuk ribuan baris.
create index profiles_search_idx on profiles using gin (
  (full_name || ' ' || email::text || ' ' || coalesce(kuy_id::text, '') || ' ' || coalesce(instagram::text, '')) gin_trgm_ops
);
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();

create function assign_member_code() returns trigger language plpgsql as $$
begin
  if new.member_code is null or new.member_code = '' then
    new.member_code := 'SOS ' || lpad(nextval('member_number_seq')::text, 4, '0') || ' ' || to_char(coalesce(new.joined_at, now()), 'YYMM');
  end if;
  return new;
end $$;
create trigger profiles_member_code before insert on profiles for each row execute function assign_member_code();

-- Member boleh mengedit profilnya, tapi kolom yang dikelola sistem/admin dikunci.
create function profiles_protect_columns() returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id and not has_permission('members', 'edit') then
    if new.tier is distinct from old.tier
       or new.status is distinct from old.status
       or new.member_code is distinct from old.member_code
       or new.joined_at is distinct from old.joined_at then
      raise exception 'Kolom tier/status/member_code hanya bisa diubah admin';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles for each row execute function profiles_protect_columns();

-- Catatan internal (hanya tim).
create table member_notes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  author_id   uuid not null references staff_members(user_id),
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index member_notes_member_idx on member_notes (member_id, created_at desc);

-- Segmen tersimpan (filter Members) — filter disimpan sebagai JSON supaya fleksibel.
create table member_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  filter      jsonb not null,                 -- {"tier":["gold","platinum"],"city":"Jakarta",...}
  created_by  uuid references staff_members(user_id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ═══ Venue ═════════════════════════════════════════════════════════════════
create table venues (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  city              text not null,                 -- "Jakarta" | "Bali"
  area              text,                          -- "Jakarta Pusat", "Kintamani"
  venue_type        text,                          -- Outdoor, Indoor, Rooftop, …
  address           text,
  maps_url          text,
  tagline           text,
  description       text,
  cover_path        text,
  hero_path         text,
  courts            text[] not null default '{}',  -- "Court 1", "Court 2 & 3"
  is_active         boolean not null default true,
  show_on_homepage  boolean not null default false,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger venues_updated_at before update on venues for each row execute function set_updated_at();

-- Participant Guide per venue (struktur kaya → JSON; lihat src/content/guides.ts).
create table venue_guides (
  venue_id     uuid primary key references venues(id) on delete cascade,
  content      jsonb not null,
  status       publish_status not null default 'draft',
  updated_by   uuid references staff_members(user_id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- ═══ Aktivitas / sesi ══════════════════════════════════════════════════════
create table activity_types (
  slug        text primary key,                   -- weekly-mabar, match-day, …
  label       text not null,
  sort_order  smallint not null default 0
);

-- Seri berulang ("Ulangi setiap minggu sampai 27 Des").
create table session_series (
  id           uuid primary key default gen_random_uuid(),
  repeat_until date not null,
  created_at   timestamptz not null default now()
);

create table sessions (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  title                  text not null,
  type_slug              text not null references activity_types(slug),
  description            text check (length(description) <= 500),
  cover_path             text,
  venue_id               uuid not null references venues(id),
  court_label            text,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  timezone               text not null default 'Asia/Jakarta',
  price                  integer not null default 0 check (price >= 0),        -- Rupiah
  capacity               integer not null check (capacity > 0),
  points_per_attendance  integer not null default 50,
  recommended_levels     tennis_level[] not null default '{}',
  waitlist_enabled       boolean not null default true,
  members_only           boolean not null default false,
  kuy_booking_url        text,
  status                 session_status not null default 'draft',
  visibility             session_visibility not null default 'public',
  publish_at             timestamptz,                 -- null = langsung tampil; masa depan = "Terjadwal"
  visible_until          timestamptz,
  show_on_homepage       boolean not null default false,
  is_featured            boolean not null default false,
  series_id              uuid references session_series(id) on delete set null,
  created_by             uuid references staff_members(user_id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index sessions_starts_idx on sessions (starts_at);
create index sessions_venue_idx  on sessions (venue_id, starts_at);
create index sessions_public_idx on sessions (starts_at) where status = 'published' and visibility = 'public';
create trigger sessions_updated_at before update on sessions for each row execute function set_updated_at();

create table session_crew (
  session_id  uuid not null references sessions(id) on delete cascade,
  staff_id    uuid not null references staff_members(user_id) on delete cascade,
  role        crew_role not null,
  primary key (session_id, staff_id, role)
);

create table bookings (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  member_id       uuid not null references profiles(id) on delete cascade,
  status          booking_status not null default 'registered',
  payment_status  payment_status not null default 'pending',
  source          booking_source not null default 'website',
  guests          smallint not null default 0 check (guests between 0 and 3),   -- "+1 teman"
  amount          integer not null default 0,
  waitlist_rank   integer,
  checked_in_at   timestamptz,
  checked_in_by   uuid references staff_members(user_id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (session_id, member_id)
);
create index bookings_member_idx  on bookings (member_id, created_at desc);
create index bookings_session_idx on bookings (session_id, status);
create trigger bookings_updated_at before update on bookings for each row execute function set_updated_at();

-- ═══ Slay Point (ledger) ═══════════════════════════════════════════════════
-- Saldo = SUM(delta). Ledger (bukan kolom saldo) → riwayat poin selalu bisa diaudit.
create table points_ledger (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references profiles(id) on delete cascade,
  delta       integer not null check (delta <> 0),
  reason      points_reason not null,
  booking_id  uuid references bookings(id) on delete set null,
  order_id    uuid,                                    -- FK ditambah setelah tabel orders
  note        text,
  created_by  uuid references staff_members(user_id) on delete set null,
  created_at  timestamptz not null default now()
);
create index points_ledger_member_idx on points_ledger (member_id, created_at desc);
-- Satu kali poin kehadiran per booking.
create unique index points_attendance_once on points_ledger (booking_id) where reason = 'attendance';

-- ═══ Shop ══════════════════════════════════════════════════════════════════
create table products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  sku               text not null unique,
  name              text not null,
  category          product_category not null,
  price             integer not null check (price >= 0),
  compare_at_price  integer check (compare_at_price is null or compare_at_price >= price),
  description       text,
  details           text[] not null default '{}',
  material          text,
  status            product_status not null default 'draft',
  is_featured       boolean not null default false,
  show_size_guide   boolean not null default false,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger products_updated_at before update on products for each row execute function set_updated_at();

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  path        text not null,
  alt         text not null default '',
  position    text,                                  -- object-position crop, mis. "50% 30%"
  sort_order  smallint not null default 0
);
create index product_images_product_idx on product_images (product_id, sort_order);

-- Varian = kombinasi pilihan (type/color/size/grip) + stok sendiri.
create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  sku         text not null unique,
  options     jsonb not null default '{}',           -- {"type":"oversize","color":"putih","size":"L"}
  stock       integer not null default 0 check (stock >= 0),
  price       integer,                               -- null → pakai harga produk
  unique (product_id, options)
);

-- Keranjang member login (tamu tetap di localStorage, digabung saat login).
create table cart_items (
  member_id   uuid not null references profiles(id) on delete cascade,
  variant_id  uuid not null references product_variants(id) on delete cascade,
  quantity    integer not null check (quantity between 1 and 99),
  added_at    timestamptz not null default now(),
  primary key (member_id, variant_id)
);

create sequence order_number_seq start 2300;

create table orders (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default ('SOS-' || nextval('order_number_seq')),
  member_id        uuid references profiles(id) on delete set null,
  status           order_status not null default 'pending',
  payment_status   payment_status not null default 'pending',
  payment_method   text,                              -- QRIS, VA BCA, GoPay, …
  channel          text not null default 'website',
  subtotal         integer not null check (subtotal >= 0),
  shipping_fee     integer not null default 0,
  points_used      integer not null default 0,
  discount         integer not null default 0,        -- nilai rupiah dari poin/promo
  total            integer not null check (total >= 0),
  recipient_name   text not null,
  recipient_phone  text not null,
  shipping_address text not null,
  courier          text,                              -- "JNE REG", "SiCepat"
  tracking_number  text,
  placed_at        timestamptz not null default now(),
  paid_at          timestamptz,
  shipped_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  updated_at       timestamptz not null default now()
);
create index orders_member_idx on orders (member_id, placed_at desc);
create index orders_status_idx on orders (status, placed_at desc);
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();

alter table points_ledger
  add constraint points_ledger_order_fk foreign key (order_id) references orders(id) on delete set null;

-- Snapshot nama/varian/harga saat beli — produk boleh berubah setelahnya.
create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  variant_id    uuid references product_variants(id) on delete set null,
  product_name  text not null,
  options       jsonb not null default '{}',
  unit_price    integer not null check (unit_price >= 0),
  quantity      integer not null check (quantity > 0)
);
create index order_items_order_idx on order_items (order_id);

-- ═══ Konten & galeri ═══════════════════════════════════════════════════════
-- Section homepage (dan halaman lain): draft disunting admin, published dibaca website.
create table content_sections (
  id            uuid primary key default gen_random_uuid(),
  page          text not null default 'home',
  key           text not null,                     -- hero, stats, venues, marquee, …
  label         text not null,
  draft         jsonb not null default '{}',
  published     jsonb,
  is_enabled    boolean not null default true,
  sort_order    smallint not null default 0,
  updated_by    uuid references staff_members(user_id) on delete set null,
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  unique (page, key)
);

create table testimonials (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references profiles(id) on delete set null,
  author_name   text not null,
  author_handle text,
  quote         text not null,
  avatar_path   text,
  is_published  boolean not null default false,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);

-- Album = satu sesi (atau event lain). Foto disimpan di Storage bucket "photos".
create table photo_albums (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid unique references sessions(id) on delete set null,
  venue_id      uuid references venues(id) on delete set null,
  title         text not null,
  taken_on      date not null,
  status        publish_status not null default 'draft',
  cover_photo   uuid,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index photo_albums_venue_idx on photo_albums (venue_id, taken_on desc);

create table photos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references photo_albums(id) on delete cascade,
  path        text not null,
  width       integer,
  height      integer,
  caption     text,
  uploaded_by uuid references staff_members(user_id) on delete set null,
  created_at  timestamptz not null default now()
);
create index photos_album_idx on photos (album_id, created_at);

-- Tag member di foto → "Foto saya" di member dashboard + avatar di galeri venue.
create table photo_tags (
  photo_id   uuid not null references photos(id) on delete cascade,
  member_id  uuid not null references profiles(id) on delete cascade,
  primary key (photo_id, member_id)
);
create index photo_tags_member_idx on photo_tags (member_id);

-- ═══ Settings, integrasi & audit ═══════════════════════════════════════════
create table app_settings (
  key         text primary key,                    -- monthly_session_target, rupiah_per_point, …
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Status integrasi saja. Secret (API key) TIDAK disimpan di sini — pakai Supabase Vault / env.
create table integrations (
  key          text primary key,                   -- kuy, reclub, payment, whatsapp, instagram
  label        text not null,
  status       text not null default 'disconnected', -- connected | disconnected | needs_reauth
  last_sync_at timestamptz
);

create table admin_audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references staff_members(user_id) on delete set null,
  action       text not null,                      -- "mengubah Hero homepage", …
  entity_type  text not null,
  entity_id    text,
  created_at   timestamptz not null default now()
);
create index admin_audit_log_created_idx on admin_audit_log (created_at desc);

-- ═══ View: statistik untuk dashboard ═══════════════════════════════════════
-- Statistik per member (tabel Members, Detail member, kartu member dashboard).
create view member_stats with (security_invoker = true) as
select
  p.id as member_id,
  count(b.*) filter (where b.status = 'attended')                                  as sessions_attended,
  count(b.*) filter (where b.status in ('attended', 'no_show'))                    as sessions_due,
  coalesce(round(100.0 * count(b.*) filter (where b.status = 'attended')
    / nullif(count(b.*) filter (where b.status in ('attended', 'no_show')), 0)), 0) as attendance_rate,
  coalesce(sum(extract(epoch from s.ends_at - s.starts_at) / 3600)
    filter (where b.status = 'attended'), 0)::numeric(8, 1)                        as hours_played,
  max(s.starts_at) filter (where b.status = 'attended')                            as last_played_at,
  coalesce((select sum(delta) from points_ledger pl where pl.member_id = p.id), 0) as points_balance,
  coalesce((select sum(delta) from points_ledger pl where pl.member_id = p.id and pl.delta > 0), 0) as points_earned,
  coalesce((select sum(total) from orders o where o.member_id = p.id and o.payment_status = 'paid'), 0) as total_spent
from profiles p
left join bookings b on b.member_id = p.id
left join sessions s on s.id = b.session_id
group by p.id;

-- Isi sesi (Sesi mendatang di Overview, kartu Activities, "22/24").
create view session_fill with (security_invoker = true) as
select
  s.id as session_id,
  s.capacity,
  count(b.*) filter (where b.status in ('registered', 'attended', 'no_show'))  as booked,
  count(b.*) filter (where b.status = 'waitlisted')                            as waitlisted,
  count(b.*) filter (where b.payment_status = 'paid')                          as paid,
  count(b.*) filter (where b.checked_in_at is not null)                        as checked_in
from sessions s
left join bookings b on b.session_id = s.id
group by s.id;

-- Tier naik otomatis saat poin kumulatif melewati ambang (dipanggil trigger ledger).
create function refresh_member_tier(p_member uuid) returns void language plpgsql as $$
declare
  earned integer;
  next_tier member_tier;
begin
  select coalesce(sum(delta), 0) into earned from points_ledger where member_id = p_member and delta > 0;
  select tier into next_tier from membership_tiers where min_points <= earned order by min_points desc limit 1;
  if next_tier is not null then
    update profiles set tier = next_tier where id = p_member and tier < next_tier;
  end if;
end $$;

create function points_ledger_after_insert() returns trigger language plpgsql as $$
begin
  perform refresh_member_tier(new.member_id);
  return new;
end $$;
create trigger points_ledger_tier after insert on points_ledger for each row execute function points_ledger_after_insert();

-- Kehadiran → poin otomatis (sekali per booking, lihat index points_attendance_once).
create function bookings_award_points() returns trigger language plpgsql as $$
declare
  pts integer;
begin
  if new.status = 'attended' and (old.status is distinct from 'attended') then
    select points_per_attendance into pts from sessions where id = new.session_id;
    if pts > 0 then
      insert into points_ledger (member_id, delta, reason, booking_id, note)
      values (new.member_id, pts, 'attendance', new.id, 'Hadir di sesi')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger bookings_points after update of status on bookings for each row execute function bookings_award_points();

-- ═══ Row Level Security ════════════════════════════════════════════════════
alter table roles               enable row level security;
alter table role_permissions    enable row level security;
alter table staff_members       enable row level security;
alter table membership_tiers    enable row level security;
alter table profiles            enable row level security;
alter table member_notes        enable row level security;
alter table member_segments     enable row level security;
alter table venues              enable row level security;
alter table venue_guides        enable row level security;
alter table activity_types      enable row level security;
alter table session_series      enable row level security;
alter table sessions            enable row level security;
alter table session_crew        enable row level security;
alter table bookings            enable row level security;
alter table points_ledger       enable row level security;
alter table products            enable row level security;
alter table product_images      enable row level security;
alter table product_variants    enable row level security;
alter table cart_items          enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table content_sections    enable row level security;
alter table testimonials        enable row level security;
alter table photo_albums        enable row level security;
alter table photos              enable row level security;
alter table photo_tags          enable row level security;
alter table app_settings        enable row level security;
alter table integrations        enable row level security;
alter table admin_audit_log     enable row level security;

-- Data publik website (anon + login).
create policy "public read tiers"          on membership_tiers for select using (true);
create policy "public read activity types" on activity_types   for select using (true);
create policy "public read venues"         on venues           for select using (is_active or has_permission('venues'));
create policy "public read guides"         on venue_guides     for select using (status = 'published' or has_permission('venues'));
create policy "public read sessions"       on sessions         for select using (
  (status in ('published', 'completed') and (publish_at is null or publish_at <= now())
    and (visibility = 'public' or (visibility = 'members' and auth.uid() is not null)))
  or has_permission('activities')
);
create policy "public read products"       on products         for select using (status = 'active' or has_permission('products'));
create policy "public read product images" on product_images   for select using (true);
create policy "public read variants"       on product_variants for select using (true);
create policy "public read content"        on content_sections for select using (is_enabled or has_permission('content'));
create policy "public read testimonials"   on testimonials     for select using (is_published or has_permission('content'));
create policy "public read albums"         on photo_albums     for select using (status = 'published' or has_permission('content'));
create policy "public read photos"         on photos           for select using (
  exists (select 1 from photo_albums a where a.id = album_id and a.status = 'published') or has_permission('content')
);
create policy "public read photo tags"     on photo_tags       for select using (true);

-- Member: data milik sendiri.
create policy "member read own profile"    on profiles      for select using (id = auth.uid() or has_permission('members'));
create policy "member update own profile"  on profiles      for update using (id = auth.uid()) with check (id = auth.uid());
create policy "member read own bookings"   on bookings      for select using (member_id = auth.uid() or has_permission('activities') or has_permission('members'));
create policy "member book session"        on bookings      for insert with check (
  member_id = auth.uid() and source = 'website' and status in ('registered', 'waitlisted')
  and payment_status = 'pending' and checked_in_at is null
  and exists (select 1 from sessions s where s.id = session_id and s.status = 'published' and s.starts_at > now())
);
create policy "member cancel own booking"  on bookings      for update using (member_id = auth.uid()) with check (member_id = auth.uid() and status = 'cancelled');
create policy "member read own points"     on points_ledger for select using (member_id = auth.uid() or has_permission('members'));
create policy "member own cart"            on cart_items    for all    using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "member read own orders"     on orders        for select using (member_id = auth.uid() or has_permission('orders'));
create policy "member read own order items" on order_items  for select using (
  exists (select 1 from orders o where o.id = order_id and (o.member_id = auth.uid() or has_permission('orders')))
);

-- Admin: tulis per modul.
create policy "admin write venues"     on venues           for all using (has_permission('venues', 'edit'))     with check (has_permission('venues', 'edit'));
create policy "admin write guides"     on venue_guides     for all using (has_permission('venues', 'edit'))     with check (has_permission('venues', 'edit'));
create policy "admin write sessions"   on sessions         for all using (has_permission('activities', 'edit')) with check (has_permission('activities', 'edit'));
create policy "admin write series"     on session_series   for all using (has_permission('activities', 'edit')) with check (has_permission('activities', 'edit'));
create policy "admin read crew"        on session_crew     for select using (true);
create policy "admin write crew"       on session_crew     for all using (has_permission('activities', 'edit')) with check (has_permission('activities', 'edit'));
create policy "admin write bookings"   on bookings         for all using (has_permission('activities', 'edit')) with check (has_permission('activities', 'edit'));
create policy "admin write profiles"   on profiles         for update using (has_permission('members', 'edit')) with check (has_permission('members', 'edit'));
create policy "admin notes"            on member_notes     for all using (has_permission('members'))            with check (has_permission('members', 'edit'));
create policy "admin segments"         on member_segments  for all using (has_permission('members'))            with check (has_permission('members', 'edit'));
create policy "admin write points"     on points_ledger    for insert with check (has_permission('members', 'edit'));
create policy "admin write products"   on products         for all using (has_permission('products', 'edit'))   with check (has_permission('products', 'edit'));
create policy "admin write images"     on product_images   for all using (has_permission('products', 'edit'))   with check (has_permission('products', 'edit'));
create policy "admin write variants"   on product_variants for all using (has_permission('products', 'edit'))   with check (has_permission('products', 'edit'));
create policy "admin write orders"     on orders           for update using (has_permission('orders', 'edit'))  with check (has_permission('orders', 'edit'));
create policy "admin write content"    on content_sections for all using (has_permission('content', 'edit'))    with check (has_permission('content', 'edit'));
create policy "admin write testi"      on testimonials     for all using (has_permission('content', 'edit'))    with check (has_permission('content', 'edit'));
create policy "admin write albums"     on photo_albums     for all using (has_permission('content', 'edit'))    with check (has_permission('content', 'edit'));
create policy "admin write photos"     on photos           for all using (has_permission('content', 'edit'))    with check (has_permission('content', 'edit'));
create policy "admin write tags"       on photo_tags       for all using (has_permission('content', 'edit'))    with check (has_permission('content', 'edit'));
create policy "admin read settings"    on app_settings     for select using (true);
create policy "admin write settings"   on app_settings     for all using (has_permission('settings', 'edit'))   with check (has_permission('settings', 'edit'));
create policy "admin integrations"     on integrations     for all using (has_permission('settings'))           with check (has_permission('settings', 'edit'));
create policy "admin roles"            on roles            for all using (has_permission('settings'))           with check (has_permission('settings', 'edit'));
create policy "admin role perms"       on role_permissions for all using (has_permission('settings'))           with check (has_permission('settings', 'edit'));
create policy "admin staff"            on staff_members    for all using (user_id = auth.uid() or has_permission('settings')) with check (has_permission('settings', 'edit'));
create policy "admin audit read"       on admin_audit_log  for select using (has_permission('settings'));
create policy "admin audit write"      on admin_audit_log  for insert with check (actor_id = auth.uid());

-- ═══ Data referensi ════════════════════════════════════════════════════════
insert into membership_tiers (tier, label, min_points, sort_order) values
  ('basic', 'Basic', 0, 1),
  ('silver', 'Silver', 500, 2),
  ('gold', 'Gold', 2000, 3),
  ('platinum', 'Platinum', 3000, 4);

insert into activity_types (slug, label, sort_order) values
  ('weekly-mabar', 'Weekly MABAR', 1),
  ('match-day', 'Tennis Match Day', 2),
  ('tennis-escape', 'Tennis Escape', 3),
  ('beginner-coaching', 'Beginner Coaching', 4),
  ('social', 'Social', 5);

insert into app_settings (key, value) values
  ('monthly_session_target', '16'),
  ('rupiah_per_point', '10000'),
  ('annual_targets', '{"sessions": 96, "hours": 150, "venues": 10}');

insert into integrations (key, label) values
  ('kuy', 'Kuy'), ('reclub', 'Reclub'), ('payment', 'Payment gateway'),
  ('whatsapp', 'WhatsApp Business'), ('instagram', 'Instagram');

-- Role bawaan + matriks izin (Figma 25:6834).
insert into roles (name, is_system) values
  ('Super Admin', true), ('Admin', true), ('Community Manager', true),
  ('Coach', true), ('Fotografer', true), ('Kasir Shop', true);

insert into role_permissions (role_id, module, access)
select r.id, m.module::admin_module, m.access::module_access
from roles r
join (values
  ('Super Admin', 'overview', 'edit'), ('Super Admin', 'members', 'edit'), ('Super Admin', 'activities', 'edit'),
  ('Super Admin', 'venues', 'edit'), ('Super Admin', 'products', 'edit'), ('Super Admin', 'orders', 'edit'),
  ('Super Admin', 'content', 'edit'), ('Super Admin', 'settings', 'edit'),
  ('Admin', 'overview', 'edit'), ('Admin', 'members', 'edit'), ('Admin', 'activities', 'edit'),
  ('Admin', 'venues', 'edit'), ('Admin', 'products', 'edit'), ('Admin', 'orders', 'edit'),
  ('Admin', 'content', 'edit'), ('Admin', 'settings', 'view'),
  ('Community Manager', 'overview', 'view'), ('Community Manager', 'members', 'edit'),
  ('Community Manager', 'activities', 'edit'), ('Community Manager', 'venues', 'view'), ('Community Manager', 'content', 'edit'),
  ('Coach', 'overview', 'view'), ('Coach', 'members', 'view'), ('Coach', 'activities', 'edit'), ('Coach', 'venues', 'view'),
  ('Fotografer', 'activities', 'view'), ('Fotografer', 'content', 'edit'),
  ('Kasir Shop', 'overview', 'view'), ('Kasir Shop', 'members', 'view'), ('Kasir Shop', 'products', 'edit'), ('Kasir Shop', 'orders', 'edit')
) as m(role, module, access) on m.role = r.name;
