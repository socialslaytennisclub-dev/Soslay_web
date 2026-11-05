-- Tennis Escape = Trip (BR-22, 5 Nov 2026). Satu trip menghubungkan beberapa activity (1 activity = 1
-- court/sesi biasa) + rundown per hari + paket bundling bayar manual (DP / cicilan / pelunasan H-14).
-- Pembeli paket otomatis terdaftar di semua activity trip (baris peserta source 'trip'); pembeli satuan
-- tetap lewat Import XLSX Kuy per activity. Setiap pembayaran paket yang dicatat → Keuangan (A-10).

-- ═══ Trip ════════════════════════════════════════════════════════════════════
create table trips (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  description       text not null default '',
  area              text not null default '',            -- "Bali · Ubud, Kintamani, Sanur"
  starts_on         date not null,
  ends_on           date not null,
  cover_path        text,
  status            session_status not null default 'draft',   -- draft · published · cancelled (= arsip)
  visibility        text not null default 'public' check (visibility in ('public', 'members', 'link')),
  show_on_homepage  boolean not null default false,
  show_rundown      boolean not null default true,
  -- Paket bundling (bayar manual / transfer).
  price_normal      integer not null default 0 check (price_normal >= 0),
  price_early_bird  integer check (price_early_bird >= 0),
  early_bird_until  date,                                   -- DP pertama masuk ≤ tanggal ini → harga early bird
  package_quota     integer not null default 0 check (package_quota >= 0),
  min_dp            integer not null default 0 check (min_dp >= 0),
  inclusions        text[] not null default '{}',
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create trigger trips_updated_at before update on trips for each row execute function set_updated_at();
comment on table trips is 'Tennis Escape: trip berisi beberapa activity (sessions.trip_id), rundown & paket bundling bayar manual.';

-- Activity trip = sesi biasa yang ditautkan. 1 activity hanya bisa masuk 1 trip.
alter table sessions
  add column trip_id      uuid references trips(id) on delete set null,
  add column trip_order   smallint,
  add column sold_single  boolean not null default true,   -- dijual satuan via Kuyy (harga = sessions.price)
  add column single_quota integer check (single_quota >= 0);
create index sessions_trip_idx on sessions (trip_id) where trip_id is not null;

-- Rundown & rangkaian acara per hari; baris bisa ditautkan ke activity trip.
create table trip_rundown_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  day         date not null,
  time_label  text not null,                 -- "05.30" / "07.00 – 10.00"
  title       text not null,
  location    text not null default '',
  session_id  uuid references sessions(id) on delete set null,
  sort        smallint not null default 0
);
create index trip_rundown_trip_idx on trip_rundown_items (trip_id, day, sort);

-- Pembeli paket bundling. Harga (early bird / normal) diturunkan dari tanggal DP pertama — tidak disimpan.
create table trip_bookings (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips(id) on delete cascade,
  member_id     uuid references profiles(id) on delete set null,
  full_name     text not null,
  phone         text,
  email         citext,
  note          text,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);
create index trip_bookings_trip_idx on trip_bookings (trip_id);
create index trip_bookings_member_idx on trip_bookings (member_id) where member_id is not null;
create unique index trip_bookings_member_unique on trip_bookings (trip_id, member_id) where member_id is not null and cancelled_at is null;

-- DP / cicilan / pelunasan. Dibatalkan = voided (tetap tersimpan untuk riwayat & koreksi Keuangan).
create table trip_payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references trip_bookings(id) on delete cascade,
  kind         text not null check (kind in ('dp', 'installment', 'settlement')),
  amount       integer not null check (amount > 0),
  received_on  date not null,
  account_id   uuid not null references finance_accounts(id),
  proof_path   text,
  proof_name   text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references auth.users(id) on delete set null,
  void_reason  text
);
create index trip_payments_booking_idx on trip_payments (booking_id);

-- ═══ Peserta paket di semua activity trip ═══════════════════════════════════
-- Baris peserta source 'trip', nomor 'T-<booking>'. Member yang sudah ada di sesi lewat jalur lain (mis.
-- beli satuan di Kuyy) tidak dicatat dua kali.
alter table session_participants drop constraint session_participants_source_check;
alter table session_participants add constraint session_participants_source_check check (source in ('kuy', 'admin', 'website', 'trip'));

create function trip_add_bundle_participants(p_session uuid, p_trip uuid, p_booking uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into session_participants (session_id, member_id, full_name, phone, email, kuy_reg_no, source, amount)
  select p_session, b.member_id, b.full_name, b.phone, b.email, 'T-' || b.id, 'trip', 0
  from trip_bookings b
  where b.trip_id = p_trip and b.cancelled_at is null and (p_booking is null or b.id = p_booking)
    and not exists (
      select 1 from session_participants p
      where p.session_id = p_session and b.member_id is not null and p.member_id = b.member_id and p.kuy_reg_no is distinct from 'T-' || b.id
    )
  on conflict (session_id, kuy_reg_no) do update
    set member_id = excluded.member_id, full_name = excluded.full_name, phone = excluded.phone, email = excluded.email;
$$;

-- Keluarkan peserta paket dari sesi (booking member yang dibuat untuknya & belum hadir ikut dihapus).
create function trip_remove_bundle_participants(p_session uuid, p_trip uuid, p_booking uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  removed uuid[];
begin
  with gone as (
    delete from session_participants p
    using trip_bookings b
    where p.session_id = p_session and p.source = 'trip' and p.kuy_reg_no = 'T-' || b.id
      and b.trip_id = p_trip and (p_booking is null or b.id = p_booking)
    returning p.member_id
  )
  select array_agg(member_id) filter (where member_id is not null) into removed from gone;
  if removed is not null then
    delete from bookings where session_id = p_session and member_id = any (removed) and status = 'registered' and source in ('kuy', 'admin');
  end if;
end $$;
revoke all on function trip_add_bundle_participants(uuid, uuid, uuid) from public;
revoke all on function trip_remove_bundle_participants(uuid, uuid, uuid) from public;

-- Pembeli paket baru / dibatalkan / data diubah → semua activity trip ikut.
create function trip_bookings_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
  b trip_bookings := case when tg_op = 'DELETE' then old else new end;
begin
  for s in select id from sessions where trip_id = b.trip_id loop
    if tg_op = 'DELETE' or b.cancelled_at is not null then
      perform trip_remove_bundle_participants(s.id, b.trip_id, b.id);
    else
      perform trip_add_bundle_participants(s.id, b.trip_id, b.id);
    end if;
  end loop;
  return null;
end $$;
create trigger trip_bookings_sync after insert or update of cancelled_at, member_id, full_name, phone, email or delete on trip_bookings
  for each row execute function trip_bookings_sync();

-- Activity ditautkan ke trip → semua pembeli paket terdaftar; dilepas → peserta paket dikeluarkan.
create function sessions_trip_link() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.trip_id is not null then
    perform trip_remove_bundle_participants(new.id, old.trip_id);
  end if;
  if new.trip_id is not null then
    perform trip_add_bundle_participants(new.id, new.trip_id);
  end if;
  return null;
end $$;
create trigger sessions_trip_link_insert after insert on sessions
  for each row when (new.trip_id is not null) execute function sessions_trip_link();
create trigger sessions_trip_link_update after update of trip_id on sessions
  for each row when (old.trip_id is distinct from new.trip_id) execute function sessions_trip_link();

-- ═══ Keuangan (A-10) ═════════════════════════════════════════════════════════
-- Setiap pembayaran paket → Pemasukan · Tiket activity · akun penerima, terkait trip, termin DP / cicilan /
-- pelunasan, di tanggal diterima. Dibatalkan → koreksi. Aturan go-live sama dengan pencatatan otomatis lain.
alter table finance_transactions add column trip_id uuid references trips(id) on delete set null;
create index finance_transactions_trip_idx on finance_transactions (trip_id) where trip_id is not null;
alter table finance_transactions drop constraint finance_transactions_source_check;
alter table finance_transactions add constraint finance_transactions_source_check check (source in (
  'manual', 'import', 'ticket', 'ticket_manual_paid', 'kuyy_import', 'shop_order_verified',
  'refund', 'pg_payout', 'transfer_fee', 'adjustment', 'trip_payment'));

-- Ref per akun ('tp:<id>:<akun>'): akun pembayaran diganti → koreksi minus di akun lama + pemasukan di akun baru.
create function finance_on_trip_payment() returns trigger language plpgsql security definer set search_path = public as $$
declare
  p   trip_payments := case when tg_op = 'DELETE' then old else new end;
  b   trip_bookings;
  t   trips;
  ref text := 'tp:' || p.id || ':' || p.account_id;
  label text;
begin
  select * into b from trip_bookings where id = p.booking_id;
  select * into t from trips where id = b.trip_id;
  label := (case p.kind when 'dp' then 'DP' when 'installment' then 'Cicilan' else 'Pelunasan' end) || ' · ' || coalesce(b.full_name, 'peserta') || ' · ' || coalesce(t.title, 'trip');
  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    perform finance_sync_auto('trip_payment', 'tp:' || old.id || ':' || old.account_id, 0, 'ticket', old.account_id, label, null, now());
  end if;
  perform finance_sync_auto('trip_payment', ref,
    case when tg_op = 'DELETE' or p.voided_at is not null then 0 else p.amount end,
    'ticket', p.account_id, label, null,
    case when exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null)
         then now() else (p.received_on + time '12:00') at time zone 'Asia/Jakarta' end);
  update finance_transactions set trip_id = t.id, term = p.kind
  where source = 'trip_payment' and source_ref like 'tp:' || p.id || ':%' and trip_id is null;
  return null;
end $$;
create trigger trip_payments_finance after insert or update of amount, account_id, voided_at or delete on trip_payments
  for each row execute function finance_on_trip_payment();

-- ═══ RLS ═════════════════════════════════════════════════════════════════════
alter table trips              enable row level security;
alter table trip_rundown_items enable row level security;
alter table trip_bookings      enable row level security;
alter table trip_payments      enable row level security;

-- Trip yang dipublikasikan boleh dibaca siapa saja yang login (info trip di halaman member).
-- Trip dipublikasikan: Publik → semua; Member → yang login; Link → hanya peserta trip (paket / satuan). Tim selalu.
create policy "read trips" on trips for select using (
  (select has_permission('activities'))
  or (status = 'published' and (
    visibility = 'public'
    or (visibility = 'members' and (select auth.uid()) is not null)
    or exists (select 1 from trip_bookings b where b.trip_id = trips.id and b.member_id = (select auth.uid()) and b.cancelled_at is null)
    or exists (select 1 from sessions s join bookings bk on bk.session_id = s.id where s.trip_id = trips.id and bk.member_id = (select auth.uid()) and bk.status <> 'cancelled')
  ))
);
create policy "admin write trips" on trips for all using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

-- Rundown: tim, dan peserta paket trip itu (bila rundown ditampilkan). Peserta satuan hanya info trip.
create policy "read trip rundown" on trip_rundown_items for select using (
  (select has_permission('activities'))
  or exists (
    select 1 from trips t join trip_bookings b on b.trip_id = t.id
    where t.id = trip_rundown_items.trip_id and t.show_rundown and t.status = 'published'
      and b.member_id = (select auth.uid()) and b.cancelled_at is null
  )
);
create policy "admin write trip rundown" on trip_rundown_items for all using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

create policy "read trip bookings" on trip_bookings for select using ((select has_permission('activities')) or member_id = (select auth.uid()));
create policy "admin write trip bookings" on trip_bookings for all using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

create policy "read trip payments" on trip_payments for select using (
  (select has_permission('activities'))
  or exists (select 1 from trip_bookings b where b.id = trip_payments.booking_id and b.member_id = (select auth.uid()))
);
create policy "admin write trip payments" on trip_payments for all using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

-- Simpan rundown sekaligus (hapus + isi ulang dalam satu transaksi). Security invoker → RLS "admin write
-- trip rundown" tetap berlaku.
create function save_trip_rundown(p_trip uuid, p_items jsonb)
returns void language plpgsql set search_path = public as $$
begin
  delete from trip_rundown_items where trip_id = p_trip;
  insert into trip_rundown_items (trip_id, day, time_label, title, location, session_id, sort)
  select p_trip, x.day, x.time_label, x.title, coalesce(x.location, ''), x.session_id, (x.ord - 1)::smallint
  from rows from (jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as (day date, time_label text, title text, location text, session_id uuid))
    with ordinality as x(day, time_label, title, location, session_id, ord);
end $$;
revoke execute on function save_trip_rundown(uuid, jsonb) from public, anon;
grant execute on function save_trip_rundown(uuid, jsonb) to authenticated;
