-- Sisa slot di website ("x slots left") sama dengan keterisian di admin: satu rumus, session_fill_base.
-- Terisi = baris daftar peserta + booking aktif (bukan batal / waitlist) yang member-nya belum ada di daftar.
-- p_sessions: sesi yang dihitung (wajib — pemanggil "semua sesi" mengirim semua id, supaya filter tetap
-- bisa memakai indeks session_id). p_exclude_member: kursi member ini sendiri tidak dihitung (booking admin).
-- Fungsi internal: tertutup untuk anon/authenticated, dipakai fungsi SECURITY DEFINER di bawah.
create function session_fill_base(p_sessions uuid[], p_exclude_member uuid default null)
returns table (session_id uuid, filled integer, trip_filled integer)
language sql stable set search_path = public as $$
  select x.session_id, count(*)::integer, count(*) filter (where x.from_trip)::integer
  from (
    -- from_trip: pembeli paket Tennis Escape (kapasitas "x paket + y satuan").
    select p.session_id, p.member_id, p.source = 'trip' as from_trip from session_participants p
    union all
    select b.session_id, b.member_id, false from bookings b
    where b.status not in ('cancelled', 'waitlisted')
      and not exists (select 1 from session_participants p where p.session_id = b.session_id and p.member_id = b.member_id)
  ) x
  where x.session_id = any (p_sessions)
    and (p_exclude_member is null or x.member_id is distinct from p_exclude_member)
  group by x.session_id;
$$;
revoke execute on function session_fill_base(uuid[], uuid) from public, anon, authenticated;

-- Admin: hanya staf aktif. Tanpa argumen = semua sesi (seperti sebelumnya); dengan p_sessions hanya sesi itu.
drop function session_fill_counts();
create function session_fill_counts(p_sessions uuid[] default null, p_exclude_member uuid default null)
returns table (session_id uuid, filled integer, trip_filled integer)
language sql stable security definer set search_path = public as $$
  select f.session_id, f.filled, f.trip_filled
  from session_fill_base(coalesce(p_sessions, array(select id from sessions)), p_exclude_member) f
  where exists (select 1 from staff_members sm where sm.user_id = (select auth.uid()) and sm.status = 'active');
$$;
revoke execute on function session_fill_counts(uuid[], uuid) from public, anon;
grant execute on function session_fill_counts(uuid[], uuid) to authenticated;

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
