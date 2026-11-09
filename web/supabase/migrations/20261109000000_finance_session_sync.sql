-- Keuangan per event: tombol "Sync" & tanggal go-live yang bisa diubah (diminta 9 Nov).
-- Pemasukan peserta (Tiket Kuyy → Saldo Kuyy, Bayar manual → akun bayar manual / BCA) sudah dicatat
-- otomatis oleh trigger saat activity selesai — tapi hanya sejak go-live (default 1 Des 2026), jadi
-- activity November tidak tercatat. Dua fungsi di sini dipanggil admin Keuangan:
--  · finance_resync_session: baca ulang semua peserta & booking "Tandai Lunas" satu activity → jalur
--    (Kuyy / manual), nominal & nama di transaksi otomatis disamakan dengan data activity (koreksi
--    lewat baris koreksi seperti biasa, bukan menghapus).
--  · finance_resync_since: sama untuk semua activity selesai sejak tanggal tertentu (setelah go-live
--    dimajukan).

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

/** Sinkron semua activity yang sudah selesai sejak tanggal (WIB) itu; mengembalikan jumlah activity. */
create function finance_resync_since(p_from date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  if not finance_full() then raise exception 'Hanya Super Admin Keuangan yang bisa sinkron'; end if;
  for v_id in
    select s.id from sessions s
    where (s.starts_at at time zone 'Asia/Jakarta')::date >= p_from and session_is_finished(s)
  loop
    perform finance_resync_session(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function finance_resync_since(date) from public, anon;
grant execute on function finance_resync_since(date) to authenticated;
