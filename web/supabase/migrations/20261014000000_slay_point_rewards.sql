-- Slay Point & Reward (Figma 316:2 · 317:37 · 317:482 · 322:2):
-- katalog reward, penukaran poin, benefit per tier. Izin memakai modul "members" (CRM).
-- Aturan poin disimpan di app_settings key "points_rules" (JSON).

create type reward_category   as enum ('merch', 'session', 'voucher', 'experience');
create type redemption_status as enum ('pending', 'approved', 'fulfilled', 'rejected');

-- Benefit tiap tier (tampil di member dashboard & admin Riwayat & tier).
alter table membership_tiers add column benefits text[] not null default '{}';

create policy "admin write tier benefits" on membership_tiers
  for update using (has_permission('members', 'edit')) with check (has_permission('members', 'edit'));

-- ═══ Katalog reward ═══════════════════════════════════════════════════════
create table rewards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 2 and 80),
  description  text check (length(description) <= 500),
  category     reward_category not null default 'merch',
  image        text,
  points_cost  integer not null check (points_cost between 1 and 1000000),
  stock        integer check (stock >= 0),                 -- null = tanpa batas
  min_tier     member_tier not null default 'basic',
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger rewards_updated_at before update on rewards for each row execute function set_updated_at();

-- ═══ Penukaran ════════════════════════════════════════════════════════════
create sequence redemption_code_seq start 1;

create table reward_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default ('RDM-' || lpad(nextval('redemption_code_seq')::text, 4, '0')),
  member_id   uuid not null references profiles(id) on delete cascade,
  reward_id   uuid not null references rewards(id) on delete restrict,
  points      integer not null check (points > 0),
  status      redemption_status not null default 'pending',
  note        text check (length(note) <= 500),
  ledger_id   bigint references points_ledger(id) on delete set null,
  handled_by  uuid references staff_members(user_id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index reward_redemptions_status_idx on reward_redemptions (status, created_at desc);
create index reward_redemptions_member_idx on reward_redemptions (member_id, created_at desc);

-- Harga poin & status awal selalu dari server (member tidak bisa mengisi sendiri).
create function redemptions_before_insert() returns trigger language plpgsql as $$
declare
  r rewards%rowtype;
  member_tier_now member_tier;
begin
  select * into r from rewards where id = new.reward_id;
  if not found or not r.is_active then
    raise exception 'Reward tidak tersedia';
  end if;
  select tier into member_tier_now from profiles where id = new.member_id;
  if member_tier_now < r.min_tier then
    raise exception 'Reward ini khusus tier % ke atas', r.min_tier;
  end if;
  new.points     := r.points_cost;
  new.status     := 'pending';
  new.ledger_id  := null;
  new.handled_by := null;
  new.handled_at := null;
  return new;
end $$;
create trigger reward_redemptions_insert before insert on reward_redemptions for each row execute function redemptions_before_insert();

-- Proses penukaran (admin): potong poin + stok saat disetujui, kembalikan saat ditolak setelah disetujui.
-- SECURITY DEFINER agar potong stok & ledger terjadi atomik; izin dicek manual.
create function set_redemption_status(p_code text, p_status redemption_status, p_note text default null)
returns reward_redemptions language plpgsql security definer set search_path = public as $$
declare
  rd reward_redemptions%rowtype;
  rw rewards%rowtype;
  balance integer;
  ledger bigint;
begin
  if not has_permission('members', 'edit') then
    raise exception 'Tidak punya izin memproses penukaran';
  end if;

  select * into rd from reward_redemptions where code = p_code for update;
  if not found then
    raise exception 'Penukaran % tidak ditemukan', p_code;
  end if;
  select * into rw from rewards where id = rd.reward_id for update;

  if rd.status = 'pending' and p_status = 'approved' then
    select coalesce(sum(delta), 0) into balance from points_ledger where member_id = rd.member_id;
    if balance < rd.points then
      raise exception 'Saldo poin member tidak cukup (% dari % pts)', balance, rd.points;
    end if;
    if rw.stock is not null and rw.stock < 1 then
      raise exception 'Stok reward habis';
    end if;
    insert into points_ledger (member_id, delta, reason, note, created_by)
    values (rd.member_id, -rd.points, 'redeem', 'Tukar ' || rw.name || ' (#' || rd.code || ')', auth.uid())
    returning id into ledger;
    update rewards set stock = stock - 1 where id = rw.id and stock is not null;
    update reward_redemptions set ledger_id = ledger where id = rd.id;
  elsif rd.status = 'approved' and p_status = 'rejected' then
    insert into points_ledger (member_id, delta, reason, note, created_by)
    values (rd.member_id, rd.points, 'adjustment', 'Pengembalian poin #' || rd.code, auth.uid());
    update rewards set stock = stock + 1 where id = rw.id and stock is not null;
  elsif not ((rd.status = 'pending' and p_status = 'rejected') or (rd.status = 'approved' and p_status = 'fulfilled')) then
    raise exception 'Status % tidak bisa diubah ke %', rd.status, p_status;
  end if;

  update reward_redemptions
     set status = p_status, note = coalesce(nullif(trim(p_note), ''), note), handled_by = auth.uid(), handled_at = now()
   where id = rd.id
  returning * into rd;
  return rd;
end $$;
revoke execute on function set_redemption_status(text, redemption_status, text) from public, anon;
grant execute on function set_redemption_status(text, redemption_status, text) to authenticated;

-- ═══ RLS ══════════════════════════════════════════════════════════════════
alter table rewards            enable row level security;
alter table reward_redemptions enable row level security;

create policy "read active rewards"   on rewards for select using (is_active or has_permission('members'));
create policy "admin insert rewards"  on rewards for insert with check (has_permission('members', 'edit'));
create policy "admin update rewards"  on rewards for update using (has_permission('members', 'edit')) with check (has_permission('members', 'edit'));
create policy "admin delete rewards"  on rewards for delete using (has_permission('members', 'edit'));

create policy "read own redemptions"  on reward_redemptions for select using (member_id = auth.uid() or has_permission('members'));
create policy "request redemption"    on reward_redemptions for insert with check (member_id = auth.uid() or has_permission('members', 'edit'));
-- Tidak ada policy update/delete: perubahan status hanya lewat set_redemption_status().

-- Aturan poin & Rp per poin boleh diubah tim CRM (selain Settings).
create policy "crm write point rules" on app_settings
  for all using (key in ('points_rules', 'rupiah_per_point') and has_permission('members', 'edit'))
  with check (key in ('points_rules', 'rupiah_per_point') and has_permission('members', 'edit'));

-- ═══ Poin otomatis ════════════════════════════════════════════════════════
-- Belanja Shop: poin = subtotal (tanpa ongkir) / rupiah_per_point, sekali per order saat order selesai.
create unique index points_purchase_once on points_ledger (order_id) where reason = 'purchase';

create function orders_award_points() returns trigger language plpgsql security definer set search_path = public as $$
declare
  rate integer;
  pts integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.member_id is not null then
    select (value #>> '{}')::integer into rate from app_settings where key = 'rupiah_per_point';
    pts := new.subtotal / greatest(coalesce(rate, 10000), 1);
    if pts > 0 then
      insert into points_ledger (member_id, delta, reason, order_id, note)
      values (new.member_id, pts, 'purchase', new.id, 'Belanja #' || new.code)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger orders_points after update of status on orders for each row execute function orders_award_points();

-- Bonus member baru (points_rules.bonuses[key=signup]).
create function profiles_signup_bonus() returns trigger language plpgsql security definer set search_path = public as $$
declare
  bonus jsonb;
begin
  select b into bonus
    from app_settings, jsonb_array_elements(value -> 'bonuses') b
   where key = 'points_rules' and b ->> 'key' = 'signup';
  if bonus is not null and (bonus ->> 'enabled')::boolean and (bonus ->> 'points')::integer > 0 then
    insert into points_ledger (member_id, delta, reason, note)
    values (new.id, (bonus ->> 'points')::integer, 'bonus', 'Bonus member baru');
  end if;
  return new;
end $$;
create trigger profiles_signup_points after insert on profiles for each row execute function profiles_signup_bonus();

-- ═══ Seed ═════════════════════════════════════════════════════════════════
update membership_tiers set benefits = case tier
  when 'basic'    then array['Akses semua sesi', 'Poin kehadiran & belanja', 'Info event lebih dulu']
  when 'silver'   then array['Semua benefit Basic', 'Diskon Shop 5%', 'Booking 24 jam lebih awal']
  when 'gold'     then array['Semua benefit Silver', 'Diskon Shop 10%', '1× sesi gratis / bulan', 'Merch eksklusif Gold']
  when 'platinum' then array['Semua benefit Gold', 'Diskon Shop 15%', 'Prioritas Tennis Escape', 'Welcome kit + jersey nama']
end;

insert into rewards (name, description, category, image, points_cost, stock, min_tier, sort_order) values
  ('Kaos A Piece of Bali',      'Kaos katun Soslay edisi Bali, semua ukuran.',            'merch',      '/images/home/product-a-piece-of-bali.webp', 1500, 24,   'basic',  1),
  ('Gratis 1× Weekly MABAR',    'Voucher satu sesi Weekly MABAR di venue mana saja.',      'session',    '/images/home/hero.webp',              800,  null, 'basic',  2),
  ('Voucher Shop Rp50.000',     'Potongan belanja Shop, berlaku 30 hari.',                 'voucher',    null,                                  450,  null, 'basic',  3),
  ('Private coaching 60 menit', 'Sesi privat dengan coach Soslay, jadwal menyesuaikan.',   'session',    '/images/home/venue-raffles.webp',     3000, 6,    'silver', 4),
  ('Tote bag Slay Club',        'Tote kanvas tebal untuk raket & perlengkapan.',           'merch',      null,                                  900,  3,    'basic',  5),
  ('Seat Tennis Escape Bali',   'Potongan Rp1.000.000 untuk trip Tennis Escape berikutnya.', 'experience', '/images/home/venue-kula-mani.webp',  7500, 2,    'gold',   6);

insert into app_settings (key, value) values ('points_rules', '{
  "attendance": {"weekly-mabar": 50, "beginner-coaching": 50, "social": 50, "match-day": 100, "tennis-escape": 150},
  "checkInOnly": true,
  "discountedProducts": false,
  "redeemDiscount": {"enabled": true, "rupiahPerPoint": 100, "maxPercent": 20},
  "bonuses": [
    {"key": "signup", "points": 100, "enabled": true},
    {"key": "birthday", "points": 200, "enabled": true},
    {"key": "referral", "points": 150, "enabled": true},
    {"key": "testimonial", "points": 50, "enabled": true},
    {"key": "streak", "points": 100, "enabled": false}
  ],
  "expiry": {"months": 12, "remind": true, "tierKeeps": true}
}'::jsonb) on conflict (key) do nothing;
