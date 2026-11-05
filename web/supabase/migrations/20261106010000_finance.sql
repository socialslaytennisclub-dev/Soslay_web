-- ═══ Modul Keuangan (ADM-18) ═════════════════════════════════════════════════
-- Acuan: docs "Aturan bisnis — Modul Keuangan" (draft v1, 5 Nov 2026).
-- Pendekatan sederhana (bukan debet/kredit): transaksi = pemasukan / pengeluaran / transfer /
-- modal pemilik. Laporan (Laba Rugi, Neraca, Tahunan, Per event) dihitung di aplikasi dari
-- tabel-tabel ini. Semua nominal BIGINT Rupiah. Hapus = soft delete (deleted_at).
--
-- Izin (role_permissions.module = 'finance'):
--   edit → akses penuh (Super Admin)
--   view → Pencatat keuangan: catat pemasukan/pengeluaran/transfer & ubah transaksinya sendiri.

create function finance_full() returns boolean language sql stable as $$ select has_permission('finance', 'edit') $$;
create function finance_member() returns boolean language sql stable as $$ select has_permission('finance', 'view') $$;

-- ── Akun (tempat uang disimpan) ───────────────────────────────────────────────
create table finance_accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  type               text not null check (type in ('bank', 'payment_gateway', 'cash', 'platform')),
  system_key         text unique,                       -- bank_main · payment_gateway · cash · kuyy
  account_no_masked  text,
  note               text,
  is_system          boolean not null default false,    -- akun sistem tidak bisa dihapus
  is_active          boolean not null default true,
  opening_balance    bigint not null default 0,
  opening_date       date not null default '2025-09-01',
  sort_order         smallint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger finance_accounts_updated_at before update on finance_accounts for each row execute function set_updated_at();

-- ── Kategori (baris di Laba Rugi) ─────────────────────────────────────────────
create table finance_categories (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null check (kind in ('income', 'expense')),
  report_group     text not null check (report_group in ('revenue', 'cogs', 'opex', 'tax')),
  journal_account  text not null,                       -- akun di export jurnal debet/kredit
  system_key       text unique,                         -- ticket · merch_sales · kuyy_fee · pg_fee · depreciation · tax
  is_system        boolean not null default false,      -- terkunci & tidak muncul di form manual
  is_archived      boolean not null default false,
  merged_into_id   uuid references finance_categories(id) on delete set null,
  note             text,
  sort_order       smallint not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (name, kind)
);
create trigger finance_categories_updated_at before update on finance_categories for each row execute function set_updated_at();

-- Kata kunci saran kategori di import jurnal (§7.4). learned = dari pilihan admin sebelumnya.
create table finance_category_keywords (
  id           bigint generated always as identity primary key,
  category_id  uuid not null references finance_categories(id) on delete cascade,
  keyword      citext not null,
  kind         text not null check (kind in ('income', 'expense')),
  source       text not null default 'default' check (source in ('default', 'learned')),
  unique (category_id, keyword)
);

-- ── Import jurnal (batch) ─────────────────────────────────────────────────────
create table finance_import_batches (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  format        text not null check (format in ('journal', 'simple')),
  period_month  text,                                   -- YYYY-MM
  default_date  date,
  rows_total    integer not null default 0,
  tx_total      integer not null default 0,
  status        text not null default 'imported' check (status in ('draft', 'imported', 'undone')),
  created_by    uuid references auth.users(id) on delete set null,
  imported_at   timestamptz not null default now(),
  undo_until    timestamptz not null default (now() + interval '24 hours'),
  undone_at     timestamptz
);

-- ── Transaksi ─────────────────────────────────────────────────────────────────
create table finance_code_counters (month text primary key, last integer not null default 0);

create table finance_transactions (
  id                       uuid primary key default gen_random_uuid(),
  code                     text unique,                 -- TRX-YYMM-#### (trigger)
  type                     text not null check (type in ('income', 'expense', 'transfer', 'owner_withdrawal', 'owner_contribution')),
  status                   text not null default 'posted' check (status in ('draft', 'posted')),
  date                     date not null,               -- tanggal uang bergerak
  recognized_on            date not null,               -- tanggal diakui di Laba Rugi
  amount                   bigint not null check (amount <> 0),   -- negatif hanya untuk koreksi otomatis
  category_id              uuid references finance_categories(id),
  account_id               uuid not null references finance_accounts(id),
  to_account_id            uuid references finance_accounts(id),
  description              text not null,
  counterparty             text,                        -- vendor / pembayar
  owner_name               text,
  note                     text,
  term                     text check (term in ('dp', 'installment', 'settlement')),
  activity_session_id      uuid references sessions(id) on delete set null,
  source                   text not null default 'manual' check (source in (
                             'manual', 'import', 'ticket', 'ticket_manual_paid', 'kuyy_import', 'shop_order_verified',
                             'refund', 'pg_payout', 'transfer_fee', 'adjustment')),
  source_ref               text,
  corrects_transaction_id  uuid references finance_transactions(id) on delete set null,
  parent_id                uuid references finance_transactions(id) on delete cascade,   -- biaya transfer → transfer induk
  import_batch_id          uuid references finance_import_batches(id) on delete set null,
  proof_path               text,
  proof_name               text,
  proof_size               integer,
  created_by               uuid references auth.users(id) on delete set null,
  updated_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  deleted_reason           text,
  check ((type in ('income', 'expense')) = (category_id is not null)),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id)
);
create index finance_tx_recognized_idx on finance_transactions (recognized_on) where deleted_at is null;
create index finance_tx_date_account_idx on finance_transactions (date, account_id) where deleted_at is null;
create index finance_tx_category_idx on finance_transactions (category_id);
create index finance_tx_batch_idx on finance_transactions (import_batch_id) where import_batch_id is not null;
create index finance_tx_session_idx on finance_transactions (activity_session_id) where activity_session_id is not null;
create index finance_tx_source_idx on finance_transactions (source, source_ref) where source_ref is not null;
create trigger finance_transactions_updated_at before update on finance_transactions for each row execute function set_updated_at();

-- Kode TRX-YYMM-#### berurutan per bulan (berdasarkan tanggal transaksi).
create function finance_tx_code() returns trigger language plpgsql security definer set search_path = public as $$
declare
  ym text := to_char(new.date, 'YYMM');
  n  integer;
begin
  if new.code is not null then return new; end if;
  insert into finance_code_counters (month, last) values (ym, 1)
  on conflict (month) do update set last = finance_code_counters.last + 1
  returning last into n;
  new.code := 'TRX-' || ym || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
create trigger finance_transactions_code before insert on finance_transactions for each row execute function finance_tx_code();

-- ── Pos manual neraca & target ────────────────────────────────────────────────
create table finance_balance_items (
  id              uuid primary key default gen_random_uuid(),
  key             text not null check (key in ('capital', 'equipment', 'receivable', 'payable', 'retained_earnings_opening', 'other_asset', 'other_liability')),
  label           text not null,
  amount          bigint not null,
  effective_date  date not null,
  meta            jsonb not null default '{}'::jsonb,   -- peralatan: { "salvage": 3000000, "life_months": 36 }
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger finance_balance_items_updated_at before update on finance_balance_items for each row execute function set_updated_at();

create table finance_targets (
  year               integer primary key,
  net_profit_target  bigint not null check (net_profit_target >= 0),
  monthly            jsonb,                             -- [12 angka] bila target per bulan
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

-- ── Pengaturan (satu baris) ───────────────────────────────────────────────────
create table finance_settings (
  id                        boolean primary key default true check (id),
  go_live_date              date not null default '2026-12-01',
  tax_enabled               boolean not null default false,   -- K-4: belum ditentukan
  tax_rate                  numeric(5, 2),                    -- persen, mis. 0.50
  auto_ticket               boolean not null default true,    -- A-1 (PG Soslay, nanti)
  auto_manual_paid          boolean not null default true,    -- A-7 Tandai Lunas
  auto_kuyy                 boolean not null default true,    -- A-8 import peserta Kuyy
  auto_shop                 boolean not null default true,    -- A-2 order shop terverifikasi
  auto_depreciation         boolean not null default true,    -- A-5 (dihitung di laporan)
  manual_paid_account_id    uuid references finance_accounts(id),
  default_bank_account_id   uuid references finance_accounts(id),
  updated_at                timestamptz not null default now()
);

-- ── Log aktivitas keuangan (nilai sebelum → sesudah) ─────────────────────────
create table finance_audit_logs (
  id         bigint generated always as identity primary key,
  entity     text not null,
  entity_id  text,
  action     text not null,
  before     jsonb,
  after      jsonb,
  actor_id   uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);
create index finance_audit_entity_idx on finance_audit_logs (entity, entity_id, at desc);

-- ═══ RLS ═════════════════════════════════════════════════════════════════════
alter table finance_accounts          enable row level security;
alter table finance_categories        enable row level security;
alter table finance_category_keywords enable row level security;
alter table finance_import_batches    enable row level security;
alter table finance_code_counters     enable row level security;
alter table finance_transactions      enable row level security;
alter table finance_balance_items     enable row level security;
alter table finance_targets           enable row level security;
alter table finance_settings          enable row level security;
alter table finance_audit_logs        enable row level security;

create policy "finance read accounts"    on finance_accounts          for select using (finance_member());
create policy "finance write accounts"   on finance_accounts          for all using (finance_full()) with check (finance_full());
create policy "finance read categories"  on finance_categories        for select using (finance_member());
create policy "finance write categories" on finance_categories        for all using (finance_full()) with check (finance_full());
create policy "finance keywords"         on finance_category_keywords for all using (finance_full()) with check (finance_full());
create policy "finance batches"          on finance_import_batches    for all using (finance_full()) with check (finance_full());
create policy "finance balance items"    on finance_balance_items     for all using (finance_full()) with check (finance_full());
create policy "finance targets"          on finance_targets           for all using (finance_full()) with check (finance_full());
create policy "finance read settings"    on finance_settings          for select using (finance_member());
create policy "finance write settings"   on finance_settings          for update using (finance_full()) with check (finance_full());
create policy "finance audit read"       on finance_audit_logs        for select using (finance_full() or (finance_member() and actor_id = auth.uid()));
create policy "finance audit write"      on finance_audit_logs        for insert with check (finance_member() and actor_id = auth.uid());

-- Transaksi: Pencatat melihat semua transaksi, tapi hanya menambah/mengubah transaksi manual
-- miliknya sendiri, dan tidak boleh mencatat modal pemilik.
create policy "finance tx read" on finance_transactions for select using (finance_member());
create policy "finance tx insert" on finance_transactions for insert with check (
  finance_full()
  or (finance_member() and created_by = auth.uid() and source = 'manual' and type in ('income', 'expense', 'transfer'))
);
create policy "finance tx update" on finance_transactions for update using (
  finance_full() or (finance_member() and created_by = auth.uid() and source = 'manual')
) with check (
  finance_full() or (finance_member() and created_by = auth.uid() and source = 'manual' and type in ('income', 'expense', 'transfer'))
);
-- Tidak ada policy delete: hapus = soft delete lewat update.

-- ═══ Data awal ═══════════════════════════════════════════════════════════════
insert into finance_accounts (name, type, system_key, account_no_masked, note, is_system, sort_order) values
  ('Bank BCA', 'bank', 'bank_main', null, 'Akun utama', false, 1),
  ('Payment gateway', 'payment_gateway', 'payment_gateway', null, 'Penampung tiket & order shop', true, 2),
  ('Kas tunai', 'cash', 'cash', null, 'Dipegang host / admin', false, 3),
  ('Saldo Kuyy', 'platform', 'kuyy', null, 'Tiket Kuyy yang belum di-withdraw', true, 4);

insert into finance_settings (manual_paid_account_id, default_bank_account_id)
select id, id from finance_accounts where system_key = 'bank_main';

insert into finance_categories (name, kind, report_group, journal_account, system_key, is_system, note, sort_order) values
  ('Tiket activity',                   'income',  'revenue', 'Pendapatan Usaha', 'ticket',       false, 'Otomatis dari Activities; manual untuk DP / cicilan', 1),
  ('Penjualan merchandise',            'income',  'revenue', 'Pendapatan Usaha', 'merch_sales',  false, 'Otomatis saat transfer order shop diverifikasi', 2),
  ('Sponsorship',                      'income',  'revenue', 'Pendapatan Usaha', null,           false, null, 3),
  ('Coaching privat',                  'income',  'revenue', 'Pendapatan Usaha', null,           false, null, 4),
  ('Sewa lapangan',                    'expense', 'opex',    'Biaya Produksi',   null,           false, 'Dicatat di tanggal bayar', 10),
  ('Honor photographer, coach & host', 'expense', 'opex',    'Gaji',             null,           false, 'Honor freelance per sesi', 11),
  ('Gaji staf',                        'expense', 'opex',    'Gaji',             null,           false, 'Payroll bulanan staf', 12),
  ('Marketing & iklan',                'expense', 'opex',    'Biaya Produksi',   null,           false, null, 13),
  ('Bola & perlengkapan',              'expense', 'opex',    'Biaya Produksi',   null,           false, null, 14),
  ('Konsumsi & hadiah',                'expense', 'opex',    'Biaya Produksi',   null,           false, null, 15),
  ('Software & langganan',             'expense', 'opex',    'Biaya Produksi',   null,           false, null, 16),
  ('Transportasi',                     'expense', 'opex',    'Biaya Produksi',   null,           false, 'Sewa mobil, bensin', 17),
  ('Produksi merchandise',             'expense', 'cogs',    'Biaya Produksi',   null,           false, 'Cetak kaos, sample, packaging · masuk baris HPP', 18),
  ('Biaya payment gateway',            'expense', 'opex',    'Biaya Produksi',   'pg_fee',       false, 'Dari potongan pencairan PG', 19),
  ('Biaya platform Kuyy',              'expense', 'opex',    'Biaya Produksi',   'kuyy_fee',     false, 'Selisih tiket Kuyy vs jumlah withdraw', 20),
  ('Penyusutan peralatan',             'expense', 'opex',    'Biaya Produksi',   'depreciation', true,  'Dicatat otomatis tiap akhir bulan', 21),
  ('PPh final UMKM',                   'expense', 'tax',     'Biaya Produksi',   'tax',          true,  'Otomatis dari omzet (bila pajak aktif)', 22);

insert into finance_category_keywords (category_id, keyword, kind)
select c.id, k.keyword, c.kind
from finance_categories c
join (values
  ('Sewa lapangan', 'book'), ('Sewa lapangan', 'lapangan'), ('Sewa lapangan', 'court'),
  ('Gaji staf', 'payroll'), ('Gaji staf', 'gaji'),
  ('Honor photographer, coach & host', 'photographer'), ('Honor photographer, coach & host', 'fotografer'),
  ('Honor photographer, coach & host', 'videographer'), ('Honor photographer, coach & host', 'editing'),
  ('Honor photographer, coach & host', 'pg '), ('Honor photographer, coach & host', 'coach'), ('Honor photographer, coach & host', 'host'),
  ('Bola & perlengkapan', 'bola'), ('Bola & perlengkapan', 'ball'),
  ('Produksi merchandise', 'tshirt'), ('Produksi merchandise', 't-shirt'), ('Produksi merchandise', 'cetak'),
  ('Produksi merchandise', 'sample'), ('Produksi merchandise', 'packaging'), ('Produksi merchandise', 'stempel'),
  ('Produksi merchandise', 'paper bag'), ('Produksi merchandise', 'goodiebag'), ('Produksi merchandise', 'plastik bag'),
  ('Produksi merchandise', 'custom character'),
  ('Software & langganan', 'utilities'), ('Software & langganan', 'adobe'), ('Software & langganan', 'drive'), ('Software & langganan', 'subscription'),
  ('Transportasi', 'bensin'), ('Transportasi', 'sewa mobil'), ('Transportasi', 'sewa mobile'), ('Transportasi', 'tol'), ('Transportasi', 'parkir'),
  ('Konsumsi & hadiah', 'makan'), ('Konsumsi & hadiah', 'konsumsi'), ('Konsumsi & hadiah', 'pengeluaran team'),
  ('Tiket activity', 'withdraw'), ('Tiket activity', 'kuyy'), ('Tiket activity', 'kuy'),
  ('Tiket activity', 'rally'), ('Tiket activity', 'rpd'), ('Tiket activity', 'pax'), ('Tiket activity', 'bayar manual'),
  ('Penjualan merchandise', 'tshirt'), ('Penjualan merchandise', 'figure')
) as k(category, keyword) on k.category = c.name;

-- Role: Super Admin akses penuh; role baru "Pencatat keuangan" (D-11).
insert into roles (name, is_system) values ('Pencatat keuangan', true) on conflict (name) do nothing;
insert into role_permissions (role_id, module, access)
select r.id, 'finance', case r.name when 'Super Admin' then 'edit' else 'view' end::module_access
from roles r where r.name in ('Super Admin', 'Pencatat keuangan')
on conflict (role_id, module) do update set access = excluded.access;

-- ═══ Pencatatan otomatis dari modul lain (§3) ════════════════════════════════
-- Satu fungsi sinkron: jumlah bersih semua transaksi (source, source_ref) dibuat sama dengan
-- `p_target`. Selisihnya dicatat sebagai transaksi baru (koreksi minus bila turun, mis. refund
-- atau batal lunas). Hanya berlaku untuk kejadian sejak go-live (data lama lewat import jurnal).
create function finance_sync_auto(
  p_source text, p_ref text, p_target bigint, p_category_key text, p_account_id uuid,
  p_description text, p_session_id uuid, p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare
  current_net bigint;
  diff        bigint;
  category    uuid;
  original    uuid;
  wib_date    date := (p_at at time zone 'Asia/Jakarta')::date;
begin
  if p_account_id is null or wib_date < (select go_live_date from finance_settings) then return; end if;
  select coalesce(sum(amount), 0), (array_agg(id order by created_at) filter (where amount > 0))[1]
    into current_net, original
  from finance_transactions
  where source = p_source and source_ref = p_ref and deleted_at is null;
  diff := coalesce(p_target, 0) - current_net;
  if diff = 0 then return; end if;
  select id into category from finance_categories where system_key = p_category_key;
  insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, activity_session_id, source, source_ref, corrects_transaction_id)
  values ('income', wib_date, wib_date, diff, category, p_account_id,
          case when diff < 0 then 'Koreksi · ' || p_description else p_description end,
          p_session_id, p_source, p_ref, case when diff < 0 then original end);
end $$;
revoke all on function finance_sync_auto(text, text, bigint, text, uuid, text, uuid, timestamptz) from public;

-- A-8 · peserta Kuyy (impor Excel di Activities) → Pemasukan · Tiket activity · Saldo Kuyy. Nominal baru
-- masuk ketika activity SUDAH SELESAI dan status bayar peserta LUNAS — keduanya bisa berubah
-- belakangan (admin mengubah nominal / status di daftar peserta), selisihnya dicatat sebagai koreksi.
-- Tanggal transaksi = tanggal activity; koreksi sesudahnya = hari koreksi. Hanya baris dari file Kuyy
-- (kuy_username terisi) — baris roster yang disalin dari booking website / ditambah admin tidak
-- dihitung sebagai uang Kuyy. Activity sebelum go-live tidak dicatat (sudah masuk lewat import jurnal).
alter table session_participants
  add column paid_at timestamptz,
  add column payment_status payment_status not null default 'paid'
    constraint session_participants_payment_check check (payment_status in ('paid', 'pending')),
  add column payment_channel text not null default 'kuy'
    constraint session_participants_channel_check check (payment_channel in ('kuy', 'manual'));
comment on column session_participants.paid_at is 'Waktu bayar dari export Kuyy (kosong bila file tidak memuatnya).';
comment on column session_participants.payment_status is 'Lunas / menunggu — bisa diubah admin setelah impor. Hanya yang lunas masuk Keuangan.';
comment on column session_participants.payment_channel is 'Jalur bayar peserta impor Kuyy: kuy (Saldo Kuyy) / manual (transfer langsung → akun bayar manual, mis. BCA).';

-- Import ulang dari export tanpa kolom waktu bayar (atau sel kosong) tidak menghapus waktu yang sudah ada.
create function session_participant_keep_paid_at() returns trigger language plpgsql as $$
begin
  new.paid_at := coalesce(new.paid_at, old.paid_at);
  return new;
end $$;
create trigger session_participants_keep_paid_at before update of paid_at on session_participants
  for each row execute function session_participant_keep_paid_at();

-- Booking member mengikuti nominal & status bayar baris pesertanya (tampil di My Activities member).
create function session_participant_payment_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is null then return null; end if;
  update bookings set payment_status = new.payment_status, amount = new.amount
  where session_id = new.session_id and member_id = new.member_id and source in ('kuy', 'admin')
    and (payment_status, amount) is distinct from (new.payment_status, new.amount);
  return null;
end $$;
-- Nama sesudah "session_participants_sync" (trigger AFTER jalan urut nama) → booking sudah dibuat.
create trigger session_participants_sync_payment after insert or update of payment_status, amount, member_id on session_participants
  for each row execute function session_participant_payment_sync();

/**
 * Samakan transaksi Keuangan satu peserta dengan keadaannya sekarang (`p_count` false = baris dihapus).
 * Via Kuy → Saldo Kuyy (sumber kuyy_import); via Manual (bayar langsung, tidak lewat Kuyy) → akun bayar
 * manual di Pengaturan Keuangan, bawaannya BCA (sumber ticket_manual_paid). Pindah jalur = koreksi minus
 * di akun lama + pemasukan di akun baru.
 */
create function finance_sync_participant(p session_participants, p_count boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  s   sessions;
  st  finance_settings;
  ref text := 'sp:' || p.id;
  due bigint;
  ch  record;
begin
  select * into st from finance_settings;
  select * into s from sessions where id = p.session_id;
  due := case when p_count and p.source = 'kuy' and p.kuy_username is not null and p.payment_status = 'paid'
                   and (s.status = 'completed' or s.ended_at is not null)
              then p.amount else 0 end;
  for ch in
    select * from (values
      ('kuyy_import', 'kuy', st.auto_kuyy, (select id from finance_accounts where system_key = 'kuyy'), 'Tiket Kuyy · '),
      ('ticket_manual_paid', 'manual', st.auto_manual_paid, st.manual_paid_account_id, 'Bayar manual · ')
    ) v(src, channel, enabled, account, label)
  loop
    continue when not ch.enabled;
    perform finance_sync_auto(ch.src, ref, case when p.payment_channel = ch.channel then due else 0 end,
      'ticket', ch.account, ch.label || p.full_name, p.session_id,
      -- Pertama kali → tanggal activity; koreksi sesudahnya → hari ini.
      case when exists (select 1 from finance_transactions where source = ch.src and source_ref = ref and deleted_at is null)
           then now() else coalesce(s.starts_at, now()) end);
  end loop;
end $$;
revoke all on function finance_sync_participant(session_participants, boolean) from public;

create function finance_on_participant() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform finance_sync_participant(old, false);
  else perform finance_sync_participant(new, true);
  end if;
  return null;
end $$;
create trigger session_participants_finance after insert or update of amount, source, kuy_username, payment_status, payment_channel or delete on session_participants
  for each row execute function finance_on_participant();

-- Activity selesai ("Akhiri Activity" / ditutup otomatis oleh close_expired_sessions) → semua peserta
-- Kuyy yang lunas tercatat. Dibuka lagi → dikoreksi.
create function finance_on_session_finished() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'completed' or new.ended_at is not null) is not distinct from (old.status = 'completed' or old.ended_at is not null) then
    return null;
  end if;
  perform finance_sync_participant(p, true) from session_participants p where p.session_id = new.id and p.source = 'kuy';
  return null;
end $$;
create trigger sessions_finance after update of status, ended_at on sessions
  for each row execute function finance_on_session_finished();

-- A-7 · "Tandai Lunas" → Pemasukan · Tiket activity · akun default bayar manual. Sengaja lewat RPC
-- eksplisit (bukan trigger pada setiap perubahan payment_status): pembayaran lewat payment gateway (A-1,
-- K-3) nanti juga mengubah booking jadi lunas, dan itu bukan bayar manual. Batal lunas → koreksi.
-- Harga Rp0 (mis. peserta impor Kuyy yang bayar manual DP) → tidak ada transaksi.
create function mark_booking_paid(p_booking uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  s finance_settings;
begin
  if not (has_permission('activities', 'edit') or exists (
    select 1 from bookings x join session_hosts h on h.session_id = x.session_id where x.id = p_booking and h.member_id = auth.uid()
  )) then
    raise exception 'Tidak punya izin menandai pembayaran.' using errcode = '42501';
  end if;
  update bookings set payment_status = (case when p_paid then 'paid' else 'pending' end)::payment_status
  where id = p_booking returning * into b;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  select * into s from finance_settings;
  if not s.auto_manual_paid then return; end if;
  perform finance_sync_auto('ticket_manual_paid', 'bk:' || b.id,
    case when p_paid then b.amount else 0 end, 'ticket', s.manual_paid_account_id,
    'Bayar manual · ' || coalesce((select full_name from profiles where id = b.member_id), 'peserta'),
    b.session_id, now());
end $$;
revoke all on function mark_booking_paid(uuid, boolean) from public;
grant execute on function mark_booking_paid(uuid, boolean) to authenticated;

-- A-2 · order shop terverifikasi (payment_status → paid) → Pemasukan · Penjualan merchandise · Bank.
-- Refund / batal → koreksi minus (A-3).
create function finance_on_order_paid() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s finance_settings;
begin
  if tg_op = 'UPDATE' and new.payment_status is not distinct from old.payment_status and new.total = old.total then return null; end if;
  select * into s from finance_settings;
  if not s.auto_shop then return null; end if;
  perform finance_sync_auto('shop_order_verified', 'ord:' || new.id,
    case when new.payment_status = 'paid' then new.total else 0 end, 'merch_sales', s.default_bank_account_id,
    'Order #' || new.code, null, coalesce(new.paid_at, now()));
  return null;
end $$;
create trigger orders_finance after insert or update of payment_status, total on orders
  for each row execute function finance_on_order_paid();
