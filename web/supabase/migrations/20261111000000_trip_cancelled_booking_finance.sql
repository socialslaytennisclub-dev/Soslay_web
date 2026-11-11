-- Peserta paket trip yang dibatalkan ("hapus" di tab Peserta & pembayaran) tetap muncul di Keuangan (laporan
-- 11 Nov, Aulia Shahnaz · Rally in Paradise - Yogyakarta). Pembatalan peserta tidak menyentuh pembayarannya,
-- jadi transaksi otomatisnya tetap aktif dan "Sync ke Keuangan" (finance_resync_trip) ikut mencatat pembayaran
-- peserta yang sudah dibatalkan. Riwayat pembayarannya juga tidak bisa dibuka lagi karena peserta disembunyikan.
-- Sekarang pembayaran peserta yang dibatalkan dihitung 0, sama seperti pembayaran yang dibatalkan (void):
--  · membatalkan peserta → transaksi pembayarannya dikoreksi ke 0 (baris "Koreksi · …", jejak tetap ada);
--  · Sync tidak mencatatnya dan mengoreksi yang sudah tercatat (data lama: klik Sync sekali);
--  · peserta diaktifkan lagi → pembayarannya tercatat lagi di tanggal terimanya.

/**
 * Nilai pembayaran trip yang dihitung Keuangan — satu aturan untuk Sync, trigger pembayaran & trigger
 * pembatalan peserta: pembayaran dibatalkan (void) atau peserta paketnya dibatalkan → 0.
 */
create function trip_payment_target(p_amount bigint, p_voided_at timestamptz, p_booking_cancelled_at timestamptz)
returns bigint language sql immutable as $$
  select case when p_voided_at is null and p_booking_cancelled_at is null then p_amount else 0 end
$$;

/**
 * Catat bagian pembayaran trip yang belum ada di Keuangan (ref 'tp:<id>:<akun>' di bawah target) — satu aturan
 * untuk Sync & peserta diaktifkan lagi. null = sudah lengkap. Hasil {action, amount, date}:
 *  · 'skip' → transaksi positifnya pernah dihapus admin (mis. dobel dengan import jurnal) & tidak ada yang aktif:
 *    tidak dibuat ulang (walau baris koreksinya masih ada);
 *  · 'new'  → pernah tercatat lalu dikoreksi → dicatat ulang HARI INI (bulan lalu tidak berubah); belum pernah
 *    tercatat → di tanggal terima;
 *  · 'wait' → belum pernah tercatat & sebelum go-live, p_wait_go_live (trigger) → ditunggu lewat Sync (pratinjau).
 * p_apply = false → hanya menghitung (pratinjau Sync).
 */
create function trip_payment_fill(p_ref text, p_target bigint, p_received date, p_account uuid, p_label text,
                                  p_trip uuid, p_kind text, p_apply boolean, p_wait_go_live boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_active bigint;
  v_recorded boolean;
  v_date date;
begin
  select coalesce(sum(amount) filter (where deleted_at is null), 0), bool_or(deleted_at is null)
  into v_active, v_recorded
  from finance_transactions where source = 'trip_payment' and source_ref = p_ref;
  if p_target <= v_active then return null; end if;
  if not exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = p_ref and deleted_at is null and amount > 0)
     and exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = p_ref and deleted_at is not null and amount > 0) then
    return jsonb_build_object('action', 'skip');
  end if;
  if coalesce(v_recorded, false) then
    v_date := (now() at time zone 'Asia/Jakarta')::date;
  else
    v_date := p_received;
    if p_wait_go_live and p_received < (select go_live_date from finance_settings) then
      return jsonb_build_object('action', 'wait');
    end if;
  end if;
  if p_apply then perform finance_insert_trip_payment(p_ref, p_target - v_active, v_date, p_account, p_label, p_trip, p_kind); end if;
  return jsonb_build_object('action', 'new', 'amount', p_target - v_active, 'date', v_date);
end $$;
revoke all on function trip_payment_fill(text, bigint, date, uuid, text, uuid, text, boolean, boolean) from public, anon, authenticated;

-- Sama dengan versi 20261110000000_trip_finance_sync, kecuali target dari trip_payment_target (peserta dibatalkan → 0)
-- dan pencatatan yang kurang lewat trip_payment_fill.
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
  fill     jsonb;
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
    target := trip_payment_target(p.amount, p.voided_at, p.booking_cancelled);
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
      fill := trip_payment_fill(ref, target, p.received_on, p.account_id, label, p_trip, p.kind, p_apply, false);
      if fill ->> 'action' = 'skip' then
        skipped := skipped + 1;
        plan := plan || jsonb_build_array(jsonb_build_array('skip', ref));
        continue;
      end if;
      items := items || jsonb_build_object('name', coalesce(p.full_name, 'peserta'), 'kind', p.kind, 'amount', (fill ->> 'amount')::bigint, 'date', fill ->> 'date');
      plan := plan || jsonb_build_array(jsonb_build_array('new', ref, (fill ->> 'amount')::bigint, fill ->> 'date'));
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

-- Sama dengan versi 20261110000000_trip_finance_sync, kecuali target dari trip_payment_target.
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
  -- Kunci yang sama dengan Sync (finance_resync_trip): tidak ada dua jalur yang mencatat ref yang sama bersamaan.
  perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || t.id));
  label := trip_payment_label(p.kind, b.full_name, t.title);
  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    select coalesce(sum(amount), 0) into moved
    from finance_transactions where source = 'trip_payment' and source_ref = 'tp:' || old.id || ':' || old.account_id and deleted_at is null;
    perform finance_sync_auto('trip_payment', 'tp:' || old.id || ':' || old.account_id, 0, 'ticket', old.account_id, label, null, now(), t.id, old.kind);
  end if;
  if moved > 0 and trip_payment_target(new.amount, new.voided_at, b.cancelled_at) > 0 then
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
    case when tg_op = 'DELETE' then 0 else trip_payment_target(p.amount, p.voided_at, b.cancelled_at) end,
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
begin
  select * into t from trips where id = new.trip_id;
  -- Kunci yang sama dengan Sync (finance_resync_trip): aktifkan lagi & Sync tidak mencatat ref yang sama bersamaan.
  perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || t.id));
  for p in select * from trip_payments where booking_id = new.id and voided_at is null order by received_on, created_at loop
    ref := 'tp:' || p.id || ':' || p.account_id;
    label := trip_payment_label(p.kind, new.full_name, t.title);
    if new.cancelled_at is not null then
      perform finance_sync_auto('trip_payment', ref, trip_payment_target(p.amount, p.voided_at, new.cancelled_at), 'ticket', p.account_id, label, null, now(), t.id, p.kind);
    else
      -- Diaktifkan lagi → bagian yang kurang dicatat lewat aturan yang sama dengan Sync (tanggal & transaksi dihapus).
      perform trip_payment_fill(ref, trip_payment_target(p.amount, p.voided_at, null), p.received_on, p.account_id, label, t.id, p.kind, true, true);
    end if;
  end loop;
  return null;
end $$;
revoke all on function finance_on_trip_booking_cancel() from public, anon, authenticated;
create trigger trip_bookings_finance after update of cancelled_at on trip_bookings
  for each row when (old.cancelled_at is distinct from new.cancelled_at) execute function finance_on_trip_booking_cancel();
