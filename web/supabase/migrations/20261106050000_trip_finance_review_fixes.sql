-- Perbaikan hasil code review Trip & Keuangan (6 Nov 2026). Semua aturan dijaga database, bukan hanya form.

-- ═══ Peserta paket ═══════════════════════════════════════════════════════════
-- Keluarkan peserta paket: hanya booking dari daftar peserta (source kuy) yang ikut dihapus, dan hanya bila
-- member tidak punya baris peserta lain di sesi itu — booking lewat jalur lain (admin / website) tetap ada. Snapshot CTE masih melihat
-- baris paket yang dihapus, jadi "jalur lain" = baris peserta selain source 'trip'.
create or replace function trip_remove_bundle_participants(p_trip uuid, p_session uuid default null, p_booking uuid default null)
returns void language sql security definer set search_path = public as $$
  with gone as (
    delete from session_participants p
    using trip_bookings b
    where p.source = 'trip' and p.kuy_reg_no = 'T-' || b.id and b.trip_id = p_trip
      and (p_session is null or p.session_id = p_session) and (p_booking is null or b.id = p_booking)
    returning p.session_id, p.member_id
  )
  delete from bookings bk using gone g
  where bk.session_id = g.session_id and bk.member_id = g.member_id
    and bk.status = 'registered' and bk.source = 'kuy'
    and not exists (
      select 1 from session_participants o
      where o.session_id = g.session_id and o.member_id = g.member_id and o.source <> 'trip'
    );
$$;

-- Pembeli paket yang belakangan masuk lewat jalur lain (mis. impor Kuyy sesudah beli paket) → baris paketnya
-- dilepas supaya tidak terhitung dua kali, dan check-in-nya pindah ke baris baru SEBELUM disimpan — jadi
-- session_participants_sync langsung melihatnya (booking tetap hadir, poin tidak ditarik). Baris jalur lain
-- itu dihapus → session_participants_restore_trip mendaftarkannya lagi lewat paket.
create index session_participants_trip_member_idx on session_participants (session_id, member_id) where source = 'trip';

create function session_participants_replace_trip_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
  v_by uuid;
begin
  with gone as (
    delete from session_participants
    where session_id = new.session_id and member_id = new.member_id and source = 'trip'
    returning checked_in_at, checked_in_by
  )
  select checked_in_at, checked_in_by into v_at, v_by from gone where checked_in_at is not null limit 1;
  if new.checked_in_at is null and v_at is not null then
    new.checked_in_at := v_at;
    new.checked_in_by := v_by;
  end if;
  return new;
end $$;
create trigger session_participants_replace_trip_row before insert or update of member_id on session_participants
  for each row when (new.source <> 'trip' and new.member_id is not null) execute function session_participants_replace_trip_row();

-- Pembeli paket baru / diaktifkan lagi: trip belum diarsipkan & kuota paket belum penuh. Baris trip dikunci
-- supaya dua admin yang menambah bersamaan tidak melewati kuota.
create function trip_bookings_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  t trips;
  n integer;
begin
  if tg_op = 'UPDATE' and old.cancelled_at is null then return new; end if;
  select * into t from trips where id = new.trip_id for update;
  if t.status = 'cancelled' then
    raise exception 'Trip sudah diarsipkan — publikasikan lagi dulu.' using hint = 'trip_archived';
  end if;
  if t.package_quota > 0 then
    select count(*) into n from trip_bookings where trip_id = new.trip_id and cancelled_at is null and id <> new.id;
    if n >= t.package_quota then
      raise exception 'Kuota paket (%) sudah penuh — naikkan kuota di Edit trip dulu.', t.package_quota using hint = 'trip_quota';
    end if;
  end if;
  return new;
end $$;
create trigger trip_bookings_guard before insert or update of cancelled_at on trip_bookings
  for each row when (new.cancelled_at is null) execute function trip_bookings_guard();

-- ═══ Pembayaran paket ════════════════════════════════════════════════════════
-- Total pembayaran aktif tidak boleh melebihi harga paket (early bird bila pembayaran pertama ≤ batasnya).
-- Satu-satunya penjaga sisa tagihan — Catat pembayaran tidak menghitung ulang; lib/trips.ts bookingMoney
-- hanya untuk tampilan. DETAIL = sisa tagihan (dipakai aplikasi untuk pesannya). Booking dikunci: dua kali simpan bersamaan tidak lolos dua-duanya.
create function trip_payments_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  b     trip_bookings;
  t     trips;
  paid  bigint;
  first date;
  price integer;
begin
  select * into b from trip_bookings where id = new.booking_id for update;
  if tg_op = 'INSERT' and b.cancelled_at is not null then
    raise exception 'Paket peserta ini sudah dibatalkan.' using hint = 'trip_booking_cancelled';
  end if;
  select * into t from trips where id = b.trip_id;
  select coalesce(sum(amount), 0), min(received_on) into paid, first
  from trip_payments where booking_id = new.booking_id and voided_at is null and id <> new.id;
  first := least(first, new.received_on);
  price := case when t.price_early_bird is not null and t.early_bird_until is not null and first <= t.early_bird_until
                then t.price_early_bird else t.price_normal end;
  if paid + new.amount > price then
    raise exception 'Jumlah melebihi sisa tagihan.' using hint = 'trip_overpaid', detail = greatest(price - paid, 0)::text;
  end if;
  return new;
end $$;
create trigger trip_payments_guard before insert or update of amount, received_on, voided_at on trip_payments
  for each row when (new.voided_at is null) execute function trip_payments_guard();

-- Pembayaran yang belum dibatalkan tidak boleh hilang lewat hapus (juga hapus peserta / hapus trip yang
-- berantai ke sini): uang yang sudah diterima tidak boleh terkoreksi diam-diam. Batalkan dulu (void).
create function trip_payments_keep() returns trigger language plpgsql as $$
begin
  raise exception 'Pembayaran yang sudah tercatat tidak bisa dihapus — batalkan pembayarannya dulu.' using hint = 'trip_payment_active';
end $$;
create trigger trip_payments_keep before delete on trip_payments
  for each row when (old.voided_at is null) execute function trip_payments_keep();

-- ═══ Simpan trip dalam satu transaksi ════════════════════════════════════════
-- Info trip, activity (baru / diambil / dilepas) & rundown sekaligus: gagal di tengah → tidak ada yang
-- berubah. Security invoker → RLS Activities tetap berlaku. p_info = kolom trips (+ slug untuk trip baru);
-- p_activities = kolom sessions (+ key; slug & type_slug untuk activity baru); p_rundown = baris rundown dengan
-- activity_key (activity baru belum punya id).
create function save_trip(p_trip uuid, p_info jsonb, p_activities jsonb, p_rundown jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  r      trips := jsonb_populate_record(null::trips, p_info);
  v_trip uuid := p_trip;
  a      jsonb;
  s      sessions;
  v_id   uuid;
  keymap jsonb := '{}'::jsonb;
  keep   uuid[] := '{}';
begin
  if v_trip is null then
    insert into trips (slug, title, description, area, starts_on, ends_on, cover_path, status, visibility, show_on_homepage,
                       show_rundown, price_normal, price_early_bird, early_bird_until, package_quota, min_dp, inclusions, created_by)
    values (r.slug, r.title, r.description, r.area, r.starts_on, r.ends_on, r.cover_path, r.status, r.visibility, r.show_on_homepage,
            r.show_rundown, r.price_normal, r.price_early_bird, r.early_bird_until, r.package_quota, r.min_dp, coalesce(r.inclusions, '{}'), auth.uid())
    returning id into v_trip;
  else
    update trips set
      title = r.title, description = r.description, area = r.area, starts_on = r.starts_on, ends_on = r.ends_on,
      cover_path = r.cover_path, status = r.status, visibility = r.visibility, show_on_homepage = r.show_on_homepage,
      show_rundown = r.show_rundown, price_normal = r.price_normal, price_early_bird = r.price_early_bird,
      early_bird_until = r.early_bird_until, package_quota = r.package_quota, min_dp = r.min_dp, inclusions = coalesce(r.inclusions, '{}')
    where id = v_trip;
    if not found then raise exception 'Trip tidak ditemukan.' using hint = 'trip_missing'; end if;
  end if;

  for a in select x from jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) x loop
    s := jsonb_populate_record(null::sessions, a);
    if s.id is not null then
      update sessions set
        title = s.title, venue_id = s.venue_id, starts_at = s.starts_at, ends_at = s.ends_at, capacity = s.capacity,
        sold_single = s.sold_single, price = s.price, single_quota = s.single_quota, kuy_booking_url = s.kuy_booking_url,
        trip_id = v_trip, trip_order = s.trip_order
      where id = s.id;
      if not found then raise exception 'Activity "%" tidak ditemukan.', s.title using hint = 'trip_missing'; end if;
      v_id := s.id;
    else
      insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, sold_single, price, single_quota,
                            kuy_booking_url, trip_id, trip_order, status, visibility, points_per_attendance, waitlist_enabled, created_by)
      values (s.slug, s.title, s.type_slug, s.venue_id, s.starts_at, s.ends_at, s.capacity, s.sold_single, s.price, s.single_quota,
              s.kuy_booking_url, v_trip, s.trip_order, r.status, r.visibility::session_visibility, 150, false, auth.uid())
      returning id into v_id;
    end if;
    keep := keep || v_id;
    keymap := keymap || jsonb_build_object(a->>'key', v_id);
  end loop;

  -- Activity yang dikeluarkan dari daftar → lepas dari trip (sesinya tetap ada, peserta paket dikeluarkan).
  update sessions set trip_id = null, trip_order = null where trip_id = v_trip and not (id = any (keep));

  perform save_trip_rundown(v_trip, coalesce((
    select jsonb_agg(x.item || jsonb_build_object('session_id', keymap->>(x.item->>'activity_key')) order by x.ord)
    from jsonb_array_elements(coalesce(p_rundown, '[]'::jsonb)) with ordinality as x(item, ord)
  ), '[]'::jsonb));
  return v_trip;
end $$;
revoke execute on function save_trip(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function save_trip(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ═══ Keuangan: koreksi di akun yang menerima uangnya ═════════════════════════
-- Sama dengan versi 20261106040000, kecuali:
--  • Jumlah turun (refund / batal lunas / pindah jalur) dikoreksi di akun yang memegang uangnya — akun sekarang
--    dulu, lalu akun lama — bukan di akun pengaturan saat ini (akun default diganti / dikosongkan di Pengaturan
--    tidak membuat saldo akun lama menggantung).
--  • p_enabled false (pencatatan otomatis dimatikan) hanya menahan pemasukan BARU; yang sudah tercatat tetap
--    dikoreksi. Satu aturan untuk semua pencatatan otomatis.
drop function finance_sync_auto(text, text, bigint, text, uuid, text, uuid, timestamptz, uuid, text);
create function finance_sync_auto(
  p_source text, p_ref text, p_target bigint, p_category_key text, p_account_id uuid,
  p_description text, p_session_id uuid, p_at timestamptz, p_trip_id uuid default null, p_term text default null,
  p_enabled boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare
  diff     bigint;
  take     bigint;
  category uuid;
  acc      record;
  wib_date date := (p_at at time zone 'Asia/Jakarta')::date;
begin
  if wib_date < (select go_live_date from finance_settings) then return; end if;
  select coalesce(p_target, 0) - coalesce(sum(amount), 0) into diff
  from finance_transactions where source = p_source and source_ref = p_ref and deleted_at is null;
  if diff = 0 or (diff > 0 and (not p_enabled or p_account_id is null)) then return; end if;
  select id into category from finance_categories where system_key = p_category_key;
  if diff > 0 then
    insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, activity_session_id, trip_id, term, source, source_ref)
    values ('income', wib_date, wib_date, diff, category, p_account_id, p_description, p_session_id, p_trip_id, p_term, p_source, p_ref);
    return;
  end if;
  for acc in
    select account_id, sum(amount) as net, (array_agg(id order by created_at) filter (where amount > 0))[1] as original
    from finance_transactions
    where source = p_source and source_ref = p_ref and deleted_at is null
    group by account_id
    having sum(amount) > 0
    order by (account_id = p_account_id) desc nulls last, max(created_at) desc
  loop
    exit when diff = 0;
    take := least(acc.net, -diff);
    insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, activity_session_id, trip_id, term, source, source_ref, corrects_transaction_id)
    values ('income', wib_date, wib_date, -take, category, acc.account_id, 'Koreksi · ' || p_description, p_session_id, p_trip_id, p_term, p_source, p_ref, acc.original);
    diff := diff + take;
  end loop;
end $$;
revoke all on function finance_sync_auto(text, text, bigint, text, uuid, text, uuid, timestamptz, uuid, text, boolean) from public;

-- Sama dengan versi 20261106010000, kecuali jalur yang dimatikan diteruskan sebagai p_enabled (koreksi tetap jalan).
create or replace function finance_sync_participant(p session_participants, p_count boolean, p_session sessions default null, p_settings finance_settings default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s        sessions := p_session;
  st       finance_settings := p_settings;
  ref      text := 'sp:' || p.id;
  due      bigint;
  recorded boolean;
  ch       record;
begin
  if s.id is null then select * into s from sessions where id = p.session_id; end if;
  due := case when p_count and p.is_kuy_import and p.payment_status = 'paid' and session_is_finished(s) then p.amount else 0 end;
  recorded := exists (select 1 from finance_transactions where source in ('kuyy_import', 'ticket_manual_paid') and source_ref = ref and deleted_at is null);
  if due = 0 and not recorded then return; end if;
  if st is null then select * into st from finance_settings; end if;
  for ch in
    select * from (values
      ('kuyy_import', 'kuy', st.auto_kuyy, (select id from finance_accounts where system_key = 'kuyy'), 'Tiket Kuyy · '),
      ('ticket_manual_paid', 'manual', st.auto_manual_paid, st.manual_paid_account_id, 'Bayar manual · ')
    ) v(src, channel, enabled, account, label)
  loop
    perform finance_sync_auto(ch.src, ref, case when p.payment_channel = ch.channel then due else 0 end,
      'ticket', ch.account, ch.label || p.full_name, p.session_id, case when recorded then now() else coalesce(s.starts_at, now()) end,
      p_enabled => ch.enabled);
  end loop;
end $$;

create or replace function mark_booking_paid(p_booking uuid, p_paid boolean)
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
  perform finance_sync_auto('ticket_manual_paid', 'bk:' || b.id,
    case when p_paid then b.amount else 0 end, 'ticket', s.manual_paid_account_id,
    'Bayar manual · ' || coalesce((select full_name from profiles where id = b.member_id), 'peserta'),
    b.session_id, now(), p_enabled => s.auto_manual_paid);
end $$;

create or replace function finance_on_order_paid() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s finance_settings;
begin
  if tg_op = 'UPDATE' and new.payment_status is not distinct from old.payment_status and new.total = old.total then return null; end if;
  select * into s from finance_settings;
  perform finance_sync_auto('shop_order_verified', 'ord:' || new.id,
    case when new.payment_status = 'paid' then new.total else 0 end, 'merch_sales', s.default_bank_account_id,
    'Order #' || new.code, null, coalesce(new.paid_at, now()), p_enabled => s.auto_shop);
  return null;
end $$;
