-- Peserta paket trip yang dibatalkan ("hapus" di tab Peserta & pembayaran) tetap muncul di Keuangan (laporan
-- 11 Nov, Aulia Shahnaz · Rally in Paradise - Yogyakarta). Pembatalan peserta tidak menyentuh pembayarannya,
-- jadi transaksi otomatisnya tetap aktif dan "Sync ke Keuangan" (finance_resync_trip) ikut mencatat pembayaran
-- peserta yang sudah dibatalkan. Riwayat pembayarannya juga tidak bisa dibuka lagi karena peserta disembunyikan.
-- Sekarang pembayaran peserta yang dibatalkan dihitung 0, sama seperti pembayaran yang dibatalkan (void):
--  · membatalkan peserta → transaksi pembayarannya dikoreksi ke 0 (baris "Koreksi · …", jejak tetap ada);
--  · Sync tidak mencatatnya dan mengoreksi yang sudah tercatat (data lama: klik Sync sekali);
--  · peserta diaktifkan lagi → pembayarannya tercatat lagi di tanggal terimanya.

-- Sama dengan versi 20261110000000_trip_finance_sync, kecuali target 0 untuk peserta yang dibatalkan.
create or replace function finance_resync_trip(p_trip uuid, p_apply boolean default true, p_expect text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t        trips%rowtype;
  p        record;
  ref      text;
  target   bigint;
  active   bigint;
  label    text;
  stale    record;
  items    jsonb := '[]'::jsonb;
  -- Isi lengkap pratinjau (pembayaran baru, koreksi & yang dilewati) untuk token — bukan hanya jumlahnya.
  plan     jsonb := '[]'::jsonb;
  fixes    integer := 0;
  skipped  integer := 0;
  n0       integer;
  n1       integer;
  check_   jsonb;
begin
  if not finance_full() then raise exception 'Hanya Super Admin Keuangan yang bisa sinkron'; end if;
  select * into t from trips where id = p_trip;
  if not found then raise exception 'Trip tidak ditemukan'; end if;
  if p_apply then
    -- Dua klik bersamaan tidak boleh sama-sama mencatat pembayaran yang sama.
    perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || p_trip));
    if p_expect is not null then
      check_ := finance_resync_trip(p_trip, false);
      if check_ ->> 'token' is distinct from p_expect then
        raise exception 'Pembayaran trip berubah sejak pratinjau — klik Sync lagi untuk melihat daftar terbaru' using hint = 'trip_sync_changed';
      end if;
    end if;
  end if;
  select count(*) into n0 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;

  for p in
    select tp.*, b.full_name, b.cancelled_at as booking_cancelled
    from trip_payments tp join trip_bookings b on b.id = tp.booking_id
    where b.trip_id = p_trip
    order by tp.received_on, tp.created_at
  loop
    ref := 'tp:' || p.id || ':' || p.account_id;
    -- Peserta dibatalkan → pembayarannya tidak dihitung (dikoreksi ke 0), sama dengan pembayaran dibatalkan.
    target := case when p.voided_at is null and p.booking_cancelled is null then p.amount else 0 end;
    label := trip_payment_label(p.kind, p.full_name, t.title);

    -- Akun penerima pernah diganti: sisa di ref akun lama dikoreksi ke 0.
    for stale in
      select source_ref from finance_transactions
      where source = 'trip_payment' and source_ref like 'tp:' || p.id || ':%' and source_ref <> ref and deleted_at is null
      group by source_ref having sum(amount) > 0
    loop
      fixes := fixes + 1;
      plan := plan || jsonb_build_array(jsonb_build_array('move', stale.source_ref));
      if p_apply then perform finance_sync_auto('trip_payment', stale.source_ref, 0, 'ticket', null, label, null, now(), p_trip, p.kind); end if;
    end loop;

    select coalesce(sum(amount), 0) into active
    from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
    if target > active then
      -- Transaksi otomatisnya pernah dihapus admin (mis. dobel dengan import jurnal) → jangan dibuat ulang.
      if active = 0 and exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is not null) then
        skipped := skipped + 1;
        plan := plan || jsonb_build_array(jsonb_build_array('skip', ref));
        continue;
      end if;
      items := items || jsonb_build_object('name', coalesce(p.full_name, 'peserta'), 'kind', p.kind, 'amount', target - active, 'date', p.received_on);
      plan := plan || jsonb_build_array(jsonb_build_array('new', ref, target - active));
      if p_apply then perform finance_insert_trip_payment(ref, target - active, p.received_on, p.account_id, label, p_trip, p.kind); end if;
    elsif target < active then
      fixes := fixes + 1;
      plan := plan || jsonb_build_array(jsonb_build_array('fix', ref, target, active));
      if p_apply then perform finance_sync_auto('trip_payment', ref, target, 'ticket', p.account_id, label, null, now(), p_trip, p.kind); end if;
    end if;
  end loop;

  select count(*) into n1 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;
  return jsonb_build_object('new', items, 'corrections', fixes, 'skipped_deleted', skipped, 'changes', n1 - n0,
                            'token', md5(plan::text));
end $$;

-- Sama dengan versi 20261110000000_trip_finance_sync, kecuali target 0 untuk peserta yang dibatalkan.
create or replace function finance_on_trip_payment() returns trigger language plpgsql security definer set search_path = public as $$
declare
  p      trip_payments := case when tg_op = 'DELETE' then old else new end;
  b      trip_bookings;
  t      trips;
  ref    text := 'tp:' || p.id || ':' || p.account_id;
  label  text;
  moved  bigint := 0;
  active bigint;
begin
  select * into b from trip_bookings where id = p.booking_id;
  select * into t from trips where id = b.trip_id;
  label := trip_payment_label(p.kind, b.full_name, t.title);
  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    select coalesce(sum(amount), 0) into moved
    from finance_transactions where source = 'trip_payment' and source_ref = 'tp:' || old.id || ':' || old.account_id and deleted_at is null;
    perform finance_sync_auto('trip_payment', 'tp:' || old.id || ':' || old.account_id, 0, 'ticket', old.account_id, label, null, now(), t.id, old.kind);
  end if;
  if moved > 0 and new.voided_at is null and b.cancelled_at is null then
    select coalesce(sum(amount), 0) into active
    from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
    if new.amount > active then
      perform finance_insert_trip_payment(ref, new.amount - active, new.received_on, new.account_id, label, t.id, new.kind);
    elsif new.amount < active then
      perform finance_sync_auto('trip_payment', ref, new.amount, 'ticket', new.account_id, label, null, now(), t.id, new.kind);
    end if;
    return null;
  end if;
  perform finance_sync_auto('trip_payment', ref,
    case when tg_op = 'DELETE' or p.voided_at is not null or b.cancelled_at is not null then 0 else p.amount end,
    'ticket', p.account_id, label, null,
    case when exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null)
         then now() else (p.received_on + time '12:00') at time zone 'Asia/Jakarta' end,
    t.id, p.kind);
  return null;
end $$;

/** Peserta paket dibatalkan / diaktifkan lagi → pembayarannya keluar / masuk lagi ke Keuangan. */
create function finance_on_trip_booking_cancel() returns trigger language plpgsql security definer set search_path = public as $$
declare
  p      trip_payments;
  t      trips;
  ref    text;
  label  text;
  active bigint;
begin
  select * into t from trips where id = new.trip_id;
  for p in select * from trip_payments where booking_id = new.id and voided_at is null order by received_on, created_at loop
    ref := 'tp:' || p.id || ':' || p.account_id;
    label := trip_payment_label(p.kind, new.full_name, t.title);
    if new.cancelled_at is not null then
      perform finance_sync_auto('trip_payment', ref, 0, 'ticket', p.account_id, label, null, now(), t.id, p.kind);
    else
      select coalesce(sum(amount), 0) into active
      from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
      if p.amount <= active then continue; end if;
      -- Pernah tercatat (lalu dikoreksi saat dibatalkan) → catat lagi di tanggal terimanya walau sebelum
      -- go-live; belum pernah tercatat → aturan biasa (go-live), sisanya lewat Sync.
      if exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null) then
        perform finance_insert_trip_payment(ref, p.amount - active, p.received_on, p.account_id, label, t.id, p.kind);
      else
        perform finance_sync_auto('trip_payment', ref, p.amount, 'ticket', p.account_id, label, null,
                                  (p.received_on + time '12:00') at time zone 'Asia/Jakarta', t.id, p.kind);
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function finance_on_trip_booking_cancel() from public, anon, authenticated;
create trigger trip_bookings_finance after update of cancelled_at on trip_bookings
  for each row when (old.cancelled_at is distinct from new.cancelled_at) execute function finance_on_trip_booking_cancel();
