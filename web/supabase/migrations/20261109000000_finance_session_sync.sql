-- Keuangan per event: tombol "Sync" & tanggal go-live yang bisa diubah (diminta 9 Nov).
-- Pemasukan peserta (Tiket Kuyy → Saldo Kuyy, Bayar manual → akun bayar manual / BCA) sudah dicatat
-- otomatis oleh trigger saat activity selesai — tapi hanya sejak go-live (default 1 Des 2026), jadi
-- activity November tidak tercatat. Dua fungsi di sini dipanggil admin Keuangan:
--  · finance_resync_session: baca ulang semua peserta & booking "Tandai Lunas" satu activity → jalur
--    (Kuyy / manual), nominal & nama di transaksi otomatis disamakan dengan data activity (koreksi
--    lewat baris koreksi seperti biasa, bukan menghapus).
--  · go-live dimajukan → aplikasi memanggil finance_resync_session per activity selesai sejak tanggal itu.
--  · finance_sync_auto: go-live hanya membatasi pencatatan baru; koreksi selalu jalan.

create function finance_resync_session(p_session uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_s  sessions%rowtype;
  v_st finance_settings%rowtype;
  v_sp session_participants%rowtype;
  v_n  integer := 0;
begin
  if not finance_full() then raise exception 'Hanya Super Admin Keuangan yang bisa sinkron'; end if;
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Activity tidak ditemukan'; end if;
  select * into v_st from finance_settings;

  for v_sp in select * from session_participants where session_id = p_session loop
    perform finance_sync_participant(v_sp, true, v_s, v_st);
    v_n := v_n + 1;
  end loop;

  -- Nama peserta diubah → keterangan transaksi otomatisnya ikut (baris koreksi tetap berawalan "Koreksi · ").
  update finance_transactions t
  set description = case when t.amount < 0 then 'Koreksi · ' else '' end
                    || case t.source when 'kuyy_import' then 'Tiket Kuyy · ' else 'Bayar manual · ' end || sp.full_name
  from session_participants sp
  where sp.session_id = p_session and t.source in ('kuyy_import', 'ticket_manual_paid') and t.source_ref = 'sp:' || sp.id
    and t.deleted_at is null
    and t.description is distinct from case when t.amount < 0 then 'Koreksi · ' else '' end
                    || case t.source when 'kuyy_import' then 'Tiket Kuyy · ' else 'Bayar manual · ' end || sp.full_name;

  -- Booking website "Tandai Lunas" (bk:<id>): nominal / status lunas / batal disamakan.
  perform finance_sync_auto('ticket_manual_paid', 'bk:' || b.id,
            case when b.payment_status = 'paid' and b.status <> 'cancelled' then b.amount else 0 end,
            'ticket', v_st.manual_paid_account_id,
            'Bayar manual · ' || coalesce((select full_name from profiles where id = b.member_id), 'peserta'), p_session, now())
  from bookings b
  where b.session_id = p_session
    and exists (select 1 from finance_transactions t where t.source = 'ticket_manual_paid' and t.source_ref = 'bk:' || b.id);

  return v_n;
end $$;
revoke execute on function finance_resync_session(uuid) from public, anon;
grant execute on function finance_resync_session(uuid) to authenticated;

-- Sinkron banyak activity sekaligus (go-live dimajukan) dijalankan aplikasi per activity — satu RPC untuk
-- semua activity bisa melewati batas waktu statement dan membatalkan semuanya.

-- Sama dengan versi 20261106050000_trip_finance_review_fixes, kecuali pengecekan go-live (lihat di dalam).
create or replace function finance_sync_auto(
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
  select coalesce(p_target, 0) - coalesce(sum(amount), 0) into diff
  from finance_transactions where source = p_source and source_ref = p_ref and deleted_at is null;
  -- Go-live hanya membatasi pencatatan BARU. Koreksi (diff < 0) atas transaksi yang sudah tercatat tetap
  -- jalan walau go-live sudah dimundurkan / tanggal koreksi sebelum go-live — kalau tidak, batal bayar,
  -- Sync & hapus activity diam-diam tidak mengoreksi uang yang sudah tercatat.
  if diff > 0 and wib_date < (select go_live_date from finance_settings) then return; end if;
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
