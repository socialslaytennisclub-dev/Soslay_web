-- Keterisian sesi (kolom Kapasitas, Penuh / Hampir penuh, Overview, okupansi venue): satu hitungan untuk
-- semua halaman & semua role admin. Terisi = baris daftar peserta (impor Kuyy / roster — termasuk ghost
-- member tanpa booking) + booking aktif (bukan batal / waitlist) yang member-nya belum ada di daftar
-- peserta (mis. booking website setelah impor). Sama dengan daftar di session_roster.
-- Security definer: staf tanpa izin Activities (RLS daftar peserta) tetap melihat angka yang sama;
-- hanya angka per sesi yang keluar, bukan data peserta.
create function session_fill_counts()
returns table (session_id uuid, filled integer, trip_filled integer)
language sql stable security definer set search_path = public as $$
  select x.session_id, count(*)::integer, count(*) filter (where x.from_trip)::integer
  from (
    -- from_trip: pembeli paket Tennis Escape (kapasitas "x paket + y satuan").
    select p.session_id, p.source = 'trip' as from_trip from session_participants p
    union all
    select b.session_id, false from bookings b
    where b.status not in ('cancelled', 'waitlisted')
      and not exists (select 1 from session_participants p where p.session_id = b.session_id and p.member_id = b.member_id)
  ) x
  where exists (select 1 from staff_members sm where sm.user_id = (select auth.uid()) and sm.status = 'active')
  group by x.session_id;
$$;
revoke execute on function session_fill_counts() from public, anon;
grant execute on function session_fill_counts() to authenticated;
