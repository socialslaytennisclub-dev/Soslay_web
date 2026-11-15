-- Sisa slot di website ("x slots left" di card activity) sama dengan keterisian di admin (session_fill_counts).
-- Dulu hanya menghitung tabel bookings → peserta dari impor Kuyy / input admin / ghost member / paket trip
-- (session_participants) tidak terhitung, sehingga activity yang sudah penuh masih tampil "6 slots left".
--
-- Satu rumus untuk keduanya: session_fill_base. Terisi = baris daftar peserta + booking aktif (bukan batal /
-- waitlist) yang member-nya belum ada di daftar. p_sessions membatasi sesi yang dihitung (null = semua) supaya
-- website hanya memindai sesi mendatang, bukan seluruh riwayat.
-- Fungsi internal: tidak bisa dipanggil langsung (tanpa cek staf); dipakai fungsi SECURITY DEFINER di bawah.
create function session_fill_base(p_sessions uuid[])
returns table (session_id uuid, filled integer, trip_filled integer)
language sql stable set search_path = public as $$
  select x.session_id, count(*)::integer, count(*) filter (where x.from_trip)::integer
  from (
    -- from_trip: pembeli paket Tennis Escape (kapasitas "x paket + y satuan").
    select p.session_id, p.source = 'trip' as from_trip from session_participants p
    where p_sessions is null or p.session_id = any (p_sessions)
    union all
    select b.session_id, false from bookings b
    where (p_sessions is null or b.session_id = any (p_sessions))
      and b.status not in ('cancelled', 'waitlisted')
      and not exists (select 1 from session_participants p where p.session_id = b.session_id and p.member_id = b.member_id)
  ) x
  group by x.session_id;
$$;
revoke execute on function session_fill_base(uuid[]) from public, anon, authenticated;

-- Admin: semua sesi, hanya untuk staf aktif (tidak berubah, kini lewat session_fill_base).
create or replace function session_fill_counts()
returns table (session_id uuid, filled integer, trip_filled integer)
language sql stable security definer set search_path = public as $$
  select f.session_id, f.filled, f.trip_filled
  from session_fill_base(null) f
  where exists (select 1 from staff_members sm where sm.user_id = (select auth.uid()) and sm.status = 'active');
$$;

-- Website: tanpa cek staf — yang keluar hanya angka sisa per sesi publik mendatang, bukan data peserta.
create or replace function public_session_slots()
returns table (session_id uuid, slots_left integer)
language sql stable security definer set search_path = public as $$
  with upcoming as (
    select s.id, s.capacity from sessions s
     where s.status = 'published'
       and s.visibility = 'public'
       and (s.publish_at is null or s.publish_at <= now())
       and s.starts_at > now()
  )
  select u.id, greatest(u.capacity - coalesce(f.filled, 0), 0)::integer
    from upcoming u
    left join session_fill_base(array(select id from upcoming)) f on f.session_id = u.id;
$$;

grant execute on function public_session_slots() to anon, authenticated;
