-- Tombol "Sync ke Keuangan" di halaman Peserta & pembayaran trip (diminta 10 Nov).
-- Ditemukan: DP 7 Sep & pelunasan 28 Okt Aulia Shahnaz (Rally in Paradise) tidak masuk Keuangan karena
-- trigger finance_on_trip_payment → finance_sync_auto melewati pembayaran bertanggal sebelum go-live
-- (diam-diam). Pembayaran trip yang dicatat admin di halaman trip adalah data asli, jadi Sync mencatat
-- yang belum ada TANPA melihat go-live, di tanggal terima pembayarannya. Karena data sebelum go-live
-- biasanya masuk lewat import jurnal, aplikasi menampilkan dulu daftar yang akan dicatat (p_apply = false)
-- dan admin mengonfirmasi — Sync tidak bisa mengenali pembayaran yang sama dari import jurnal.
-- Aman diklik berkali-kali: tiap pembayaran punya ref tetap ('tp:<id>:<akun>'); yang sudah tercatat tidak
-- dicatat lagi, dan transaksi otomatis yang DIHAPUS admin (mis. karena dobel) tidak dibuat ulang.
-- Pembayaran yang dibatalkan / pindah akun → koreksi seperti biasa.

/** Label transaksi pembayaran trip — sama dengan finance_on_trip_payment. */
create function trip_payment_label(p_kind text, p_name text, p_trip text) returns text language sql immutable as $$
  select (case p_kind when 'dp' then 'DP' when 'installment' then 'Cicilan' else 'Pelunasan' end)
         || ' · ' || coalesce(p_name, 'peserta') || ' · ' || coalesce(p_trip, 'trip')
$$;

/** Catat pemasukan pembayaran trip di tanggal terimanya, tanpa pengecekan go-live. */
create function finance_insert_trip_payment(p_ref text, p_amount bigint, p_received date, p_account uuid, p_label text, p_trip uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, activity_session_id, trip_id, term, source, source_ref)
  values ('income', p_received, p_received, p_amount, (select id from finance_categories where system_key = 'ticket'),
          p_account, p_label, null, p_trip, p_kind, 'trip_payment', p_ref);
$$;
revoke all on function finance_insert_trip_payment(text, bigint, date, uuid, text, uuid, text) from public;

/**
 * Sinkron pembayaran paket satu trip ke Keuangan. p_apply = false → hanya pratinjau (tidak menulis).
 * Mengembalikan { "new": [{name, kind, amount, date}], "corrections": n, "skipped_deleted": n, "changes": n }.
 */
create function finance_resync_trip(p_trip uuid, p_apply boolean default true) returns jsonb
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
  fixes    integer := 0;
  skipped  integer := 0;
  n0       integer;
  n1       integer;
begin
  if not finance_full() then raise exception 'Hanya Super Admin Keuangan yang bisa sinkron'; end if;
  select * into t from trips where id = p_trip;
  if not found then raise exception 'Trip tidak ditemukan'; end if;
  -- Dua klik bersamaan tidak boleh sama-sama mencatat pembayaran yang sama.
  if p_apply then perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || p_trip)); end if;
  select count(*) into n0 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;

  for p in
    select tp.*, b.full_name
    from trip_payments tp join trip_bookings b on b.id = tp.booking_id
    where b.trip_id = p_trip
    order by tp.received_on, tp.created_at
  loop
    ref := 'tp:' || p.id || ':' || p.account_id;
    target := case when p.voided_at is null then p.amount else 0 end;
    label := trip_payment_label(p.kind, p.full_name, t.title);

    -- Akun penerima pernah diganti: sisa di ref akun lama dikoreksi ke 0.
    for stale in
      select source_ref from finance_transactions
      where source = 'trip_payment' and source_ref like 'tp:' || p.id || ':%' and source_ref <> ref and deleted_at is null
      group by source_ref having sum(amount) <> 0
    loop
      fixes := fixes + 1;
      if p_apply then perform finance_sync_auto('trip_payment', stale.source_ref, 0, 'ticket', null, label, null, now(), p_trip, p.kind); end if;
    end loop;

    select coalesce(sum(amount), 0) into active
    from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
    if target > active then
      -- Transaksi otomatisnya pernah dihapus admin (mis. dobel dengan import jurnal) → jangan dibuat ulang.
      if active = 0 and exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is not null) then
        skipped := skipped + 1;
        continue;
      end if;
      items := items || jsonb_build_object('name', coalesce(p.full_name, 'peserta'), 'kind', p.kind, 'amount', target - active, 'date', p.received_on);
      if p_apply then perform finance_insert_trip_payment(ref, target - active, p.received_on, p.account_id, label, p_trip, p.kind); end if;
    elsif target < active then
      fixes := fixes + 1;
      if p_apply then perform finance_sync_auto('trip_payment', ref, target, 'ticket', p.account_id, label, null, now(), p_trip, p.kind); end if;
    end if;
  end loop;

  select count(*) into n1 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;
  return jsonb_build_object('new', items, 'corrections', fixes, 'skipped_deleted', skipped, 'changes', n1 - n0);
end $$;
revoke execute on function finance_resync_trip(uuid, boolean) from public, anon;
grant execute on function finance_resync_trip(uuid, boolean) to authenticated;

-- Sama dengan versi 20261106040000_trips, kecuali: akun penerima diganti untuk pembayaran yang SUDAH
-- tercatat (mis. lewat Sync, bertanggal sebelum go-live) → dipindah ke akun baru di tanggal terimanya.
-- Sebelumnya akun lama dikoreksi ke 0 tapi akun baru dilewati go-live, jadi uangnya hilang dari Keuangan.
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
  if moved > 0 and new.voided_at is null then
    select coalesce(sum(amount), 0) into active
    from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
    if new.amount > active then
      perform finance_insert_trip_payment(ref, new.amount - active, new.received_on, new.account_id, label, t.id, new.kind);
    end if;
    return null;
  end if;
  perform finance_sync_auto('trip_payment', ref,
    case when tg_op = 'DELETE' or p.voided_at is not null then 0 else p.amount end,
    'ticket', p.account_id, label, null,
    case when exists (select 1 from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null)
         then now() else (p.received_on + time '12:00') at time zone 'Asia/Jakarta' end,
    t.id, p.kind);
  return null;
end $$;
