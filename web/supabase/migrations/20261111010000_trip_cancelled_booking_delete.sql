-- "Keluarkan dari Keuangan" = HAPUS (diminta 11 Nov, setelah dicek di live): peserta paket trip yang dibatalkan
-- tidak boleh lagi muncul di Keuangan sama sekali. Versi 20261111000000 menulis baris "Koreksi · …" (−) di
-- samping pemasukan aslinya, jadi di daftar transaksi Keuangan peserta itu masih tampil dua baris.
-- Sekarang:
--  · peserta dibatalkan → semua transaksi pembayaran trip-nya (pemasukan & koreksi) dihapus (soft delete,
--    deleted_reason = 'Peserta paket dibatalkan') — tidak tampil & tidak dihitung, jejaknya tetap di database;
--  · peserta diaktifkan lagi → transaksi yang dihapus karena pembatalan itu dipulihkan apa adanya (tanggal asli);
--    transaksi yang dihapus admin sendiri tidak ikut dipulihkan;
--  · Sync: peserta dibatalkan yang transaksinya masih aktif → dihapus dengan cara yang sama;
--  · data yang sudah ada: peserta yang sudah dibatalkan (Aulia Shahnaz & Shahnaz · Rally in Paradise) →
--    pemasukan & baris koreksinya dihapus sekarang.

/** Hapus semua transaksi Keuangan satu pembayaran trip karena pesertanya dibatalkan (bisa dipulihkan). */
create function trip_payment_drop(p_payment uuid) returns void language sql security definer set search_path = public as $$
  update finance_transactions
  set deleted_at = now(), deleted_reason = 'Peserta paket dibatalkan'
  where source = 'trip_payment' and source_ref like 'tp:' || p_payment || ':%' and deleted_at is null;
$$;

/** Pulihkan transaksi yang dihapus trip_payment_drop (peserta diaktifkan lagi). Hapus manual admin tidak ikut. */
create function trip_payment_restore(p_payment uuid) returns void language sql security definer set search_path = public as $$
  update finance_transactions
  set deleted_at = null, deleted_reason = null
  where source = 'trip_payment' and source_ref like 'tp:' || p_payment || ':%' and deleted_at is not null
    and deleted_reason = 'Peserta paket dibatalkan';
$$;
revoke all on function trip_payment_drop(uuid) from public, anon, authenticated;
revoke all on function trip_payment_restore(uuid) from public, anon, authenticated;

-- Sama dengan versi 20261111000000_trip_cancelled_booking_finance, kecuali peserta dibatalkan → dihapus (bukan koreksi).
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
    elsif target < active and p.booking_cancelled is not null then
      -- Peserta dibatalkan → transaksinya DIHAPUS dari Keuangan (bukan baris koreksi), bisa dipulihkan.
      fixes := fixes + 1;
      plan := plan || jsonb_build_array(jsonb_build_array('drop', ref, active));
      if p_apply then perform trip_payment_drop(p.id); end if;
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

/** Peserta paket dibatalkan → transaksi pembayarannya dihapus; diaktifkan lagi → dipulihkan (+ yang kurang dicatat). */
create or replace function finance_on_trip_booking_cancel() returns trigger language plpgsql security definer set search_path = public as $$
declare
  p      trip_payments;
  t      trips;
  label  text;
begin
  select * into t from trips where id = new.trip_id;
  -- Kunci yang sama dengan Sync (finance_resync_trip): aktifkan lagi & Sync tidak mencatat ref yang sama bersamaan.
  perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || t.id));
  for p in select * from trip_payments where booking_id = new.id order by received_on, created_at loop
    if new.cancelled_at is not null then
      perform trip_payment_drop(p.id);
    else
      perform trip_payment_restore(p.id);
      if p.voided_at is null then
        label := trip_payment_label(p.kind, new.full_name, t.title);
        -- Belum pernah tercatat / masih kurang → aturan yang sama dengan Sync (tanggal & transaksi dihapus admin).
        perform trip_payment_fill('tp:' || p.id || ':' || p.account_id, p.amount, p.received_on, p.account_id, label, t.id, p.kind, true, true);
      end if;
    end if;
  end loop;
  return null;
end $$;

-- Data yang sudah ada: peserta yang sudah dibatalkan → transaksi pembayarannya dihapus.
select trip_payment_drop(p.id)
from trip_payments p join trip_bookings b on b.id = p.booking_id
where b.cancelled_at is not null;
