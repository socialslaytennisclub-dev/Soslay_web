-- Hapus activity salah input (diminta 8 Nov): activity yang sudah punya peserta — bahkan yang sudah
-- lewat / selesai — bisa dihapus admin beserta pesertanya. Sebelumnya hanya bisa diganti "Dibatalkan".
-- Riwayat yang menyangkut uang & poin tidak dihapus diam-diam:
--  · poin kehadiran / bonus juara dari activity ini dinetralkan dengan baris penyesuaian;
--  · transaksi Keuangan otomatis peserta (Tiket Kuyy / Bayar manual) dikoreksi oleh trigger Keuangan
--    yang sudah ada saat baris peserta dihapus; "Tandai Lunas" booking website dikoreksi di sini.
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

  -- Sama dengan daftar peserta di admin: baris peserta + booking yang member-nya belum ada di daftar itu.
  select (select count(*) from session_participants where session_id = p_session)
       + (select count(*) from bookings b where b.session_id = p_session and b.status not in ('cancelled', 'waitlisted')
            and not exists (select 1 from session_participants sp where sp.session_id = p_session and sp.member_id = b.member_id))
  into v_people;

  -- Poin dari activity ini: kehadiran, bonus juara & bonus review (lewat session_id / booking), plus bonus
  -- review +10 peserta tanpa booking (impor Kuyy). Baris itu dicatat di transaksi yang sama dengan
  -- review-nya → created_at sama persis (tidak bergantung judul, yang bisa sudah diganti).
  insert into points_ledger (member_id, delta, reason, note, created_by)
  select l.member_id, -sum(l.delta)::int, 'adjustment', format('Activity dihapus (salah input) · %s', v_s.title),
         (select user_id from staff_members where user_id = auth.uid())
  from points_ledger l
  where (l.reason in ('attendance', 'bonus')
         and (l.session_id = p_session or l.booking_id in (select b.id from bookings b where b.session_id = p_session)))
     or (l.reason = 'bonus' and l.booking_id is null and l.session_id is null and l.note like 'Review sesi · %'
         and exists (select 1 from session_reviews r where r.session_id = p_session and r.member_id = l.member_id and r.created_at = l.created_at))
  group by l.member_id
  having sum(l.delta) <> 0;

  -- Booking website yang ditandai lunas manual ("Tandai Lunas", source_ref bk:<id>) tidak punya trigger
  -- hapus → pemasukannya dikoreksi di sini, selagi booking & activity masih ada.
  perform finance_sync_auto('ticket_manual_paid', 'bk:' || b.id, 0, 'ticket', null,
            'Bayar manual · ' || coalesce((select full_name from profiles where id = b.member_id), 'peserta'), p_session, now())
  from bookings b where b.session_id = p_session;

  -- Peserta dulu (trigger Keuangan mengoreksi selagi activity masih ada), lalu booking & activity
  -- (line-up, host, foto ikut terhapus lewat on delete cascade).
  delete from session_participants where session_id = p_session;
  delete from bookings where session_id = p_session;
  delete from sessions where id = p_session;
  return v_people;
end $$;
revoke execute on function delete_session_mistake(uuid, text) from public, anon;
grant execute on function delete_session_mistake(uuid, text) to authenticated;
