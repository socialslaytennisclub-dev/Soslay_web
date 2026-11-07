-- Hapus activity salah input (diminta 8 Nov): activity yang sudah punya peserta — bahkan yang sudah
-- lewat / selesai — bisa dihapus admin beserta pesertanya. Sebelumnya hanya bisa diganti "Dibatalkan".
-- Riwayat yang menyangkut uang & poin tidak dihapus diam-diam:
--  · poin kehadiran / bonus juara dari activity ini dinetralkan dengan baris penyesuaian;
--  · transaksi Keuangan otomatis peserta (Tiket Kuyy / Bayar manual) dikoreksi oleh trigger Keuangan
--    yang sudah ada saat baris peserta dihapus.
-- Activity paket trip ditolak (diatur lewat trip). Admin harus mengetik judul activity (dicek ulang di sini).

create function delete_session_mistake(p_session uuid, p_title text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_people integer;
begin
  if not has_permission('activities', 'edit') then raise exception 'Hanya admin yang bisa menghapus activity'; end if;
  select * into v_s from sessions where id = p_session for update;
  if not found then raise exception 'Activity tidak ditemukan'; end if;
  if v_s.title is distinct from p_title then raise exception 'Judul yang diketik tidak sama dengan judul activity'; end if;
  if v_s.trip_id is not null then raise exception 'Activity paket trip — hapus / batalkan lewat halaman trip'; end if;

  select count(*) into v_people from (
    select member_id from bookings where session_id = p_session and status <> 'cancelled'
    union all
    select null from session_participants where session_id = p_session and member_id is null
  ) x;

  insert into points_ledger (member_id, delta, reason, note, created_by)
  select l.member_id, -sum(l.delta)::int, 'adjustment', format('Activity dihapus (salah input) · %s', v_s.title),
         (select user_id from staff_members where user_id = auth.uid())
  from points_ledger l
  where l.reason in ('attendance', 'bonus')
    and (l.session_id = p_session or l.booking_id in (select b.id from bookings b where b.session_id = p_session))
  group by l.member_id
  having sum(l.delta) <> 0;

  -- Peserta dulu (trigger Keuangan mengoreksi selagi activity masih ada), lalu booking & activity
  -- (line-up, host, foto ikut terhapus lewat on delete cascade).
  delete from session_participants where session_id = p_session;
  delete from bookings where session_id = p_session;
  delete from sessions where id = p_session;
  return v_people;
end $$;
revoke execute on function delete_session_mistake(uuid, text) from public, anon;
grant execute on function delete_session_mistake(uuid, text) to authenticated;
