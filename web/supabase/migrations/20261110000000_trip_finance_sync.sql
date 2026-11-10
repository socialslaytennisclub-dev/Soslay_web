-- Tombol "Sync ke Keuangan" di halaman Peserta & pembayaran trip (diminta 10 Nov).
-- Ditemukan: DP 7 Sep & pelunasan 28 Okt Aulia Shahnaz (Rally in Paradise) tidak masuk Keuangan karena
-- trigger finance_on_trip_payment → finance_sync_auto melewati pembayaran bertanggal sebelum go-live
-- (diam-diam). Pembayaran trip yang dicatat admin di halaman trip adalah data asli, jadi Sync ini mencatat
-- yang belum ada TANPA melihat go-live, di tanggal terima pembayarannya.
-- Aman diklik berkali-kali: tiap pembayaran punya ref tetap ('tp:<id>:<akun>'); yang sudah tercatat tidak
-- dicatat lagi (hanya selisihnya). Pembayaran yang dibatalkan / pindah akun → koreksi seperti biasa.
-- Tidak bisa mendeteksi pembayaran yang sama yang sudah masuk lewat import jurnal (sumber lain).

/** Sinkron semua pembayaran paket satu trip ke Keuangan; mengembalikan jumlah transaksi baru (termasuk koreksi). */
create function finance_resync_trip(p_trip uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  t      trips%rowtype;
  p      record;
  ref    text;
  target bigint;
  diff   bigint;
  label  text;
  stale  record;
  n0     integer;
  n1     integer;
begin
  if not finance_full() then raise exception 'Hanya Super Admin Keuangan yang bisa sinkron'; end if;
  select * into t from trips where id = p_trip;
  if not found then raise exception 'Trip tidak ditemukan'; end if;
  -- Dua klik bersamaan tidak boleh sama-sama mencatat pembayaran yang sama.
  perform pg_advisory_xact_lock(hashtext('finance_resync_trip:' || p_trip));
  select count(*) into n0 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;

  for p in
    select tp.*, b.full_name
    from trip_payments tp join trip_bookings b on b.id = tp.booking_id
    where b.trip_id = p_trip
  loop
    ref := 'tp:' || p.id || ':' || p.account_id;
    target := case when p.voided_at is null then p.amount else 0 end;
    label := (case p.kind when 'dp' then 'DP' when 'installment' then 'Cicilan' else 'Pelunasan' end)
             || ' · ' || coalesce(p.full_name, 'peserta') || ' · ' || coalesce(t.title, 'trip');

    -- Akun penerima pernah diganti: sisa di ref akun lama dikoreksi ke 0.
    for stale in
      select source_ref from finance_transactions
      where source = 'trip_payment' and source_ref like 'tp:' || p.id || ':%' and source_ref <> ref and deleted_at is null
      group by source_ref having sum(amount) <> 0
    loop
      perform finance_sync_auto('trip_payment', stale.source_ref, 0, 'ticket', null, label, null, now(), p_trip, p.kind);
    end loop;

    select target - coalesce(sum(amount), 0) into diff
    from finance_transactions where source = 'trip_payment' and source_ref = ref and deleted_at is null;
    if diff > 0 then
      -- Belum tercatat (mis. sebelum go-live): catat di tanggal terima, tanpa pengecekan go-live.
      insert into finance_transactions (type, date, recognized_on, amount, category_id, account_id, description, activity_session_id, trip_id, term, source, source_ref)
      values ('income', p.received_on, p.received_on, diff, (select id from finance_categories where system_key = 'ticket'),
              p.account_id, label, null, p_trip, p.kind, 'trip_payment', ref);
    elsif diff < 0 then
      perform finance_sync_auto('trip_payment', ref, target, 'ticket', p.account_id, label, null, now(), p_trip, p.kind);
    end if;
  end loop;

  select count(*) into n1 from finance_transactions where source = 'trip_payment' and trip_id = p_trip;
  return n1 - n0;
end $$;
revoke execute on function finance_resync_trip(uuid) from public, anon;
grant execute on function finance_resync_trip(uuid) to authenticated;
