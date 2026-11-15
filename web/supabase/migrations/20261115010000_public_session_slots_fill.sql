-- Sisa slot di website ("x slots left" di card activity) sama dengan keterisian di admin (session_fill_counts).
-- Dulu hanya menghitung tabel bookings → peserta dari impor Kuyy / input admin / ghost member / paket trip
-- (session_participants) tidak terhitung, sehingga activity yang sudah penuh masih tampil "6 slots left".
-- Terisi = baris daftar peserta + booking aktif (bukan batal / waitlist) yang member-nya belum ada di daftar.
-- Tanpa cek staf seperti session_fill_counts: yang keluar hanya angka sisa per sesi publik, bukan data peserta.
create or replace function public_session_slots()
returns table (session_id uuid, slots_left integer)
language sql stable security definer set search_path = public as $$
  select s.id,
         greatest(s.capacity - coalesce(f.filled, 0), 0)::integer
    from sessions s
    left join (
      select x.session_id, count(*) as filled
      from (
        select p.session_id from session_participants p
        union all
        select b.session_id from bookings b
        where b.status not in ('cancelled', 'waitlisted')
          and not exists (select 1 from session_participants p where p.session_id = b.session_id and p.member_id = b.member_id)
      ) x
      group by x.session_id
    ) f on f.session_id = s.id
   where s.status = 'published'
     and s.visibility = 'public'
     and (s.publish_at is null or s.publish_at <= now())
     and s.starts_at > now();
$$;

grant execute on function public_session_slots() to anon, authenticated;
