-- Sisa slot sesi untuk website (kartu "Upcoming Activities" di Venue detail, Figma 375:3700).
-- Pengunjung tidak boleh membaca bookings (RLS), jadi angka dihitung di fungsi SECURITY DEFINER
-- dan hanya untuk sesi publik yang sudah tayang & belum mulai.
create function public_session_slots()
returns table (session_id uuid, slots_left integer)
language sql stable security definer set search_path = public as $$
  select s.id,
         greatest(s.capacity - count(b.*) filter (where b.status in ('registered', 'attended')), 0)::integer
    from sessions s
    left join bookings b on b.session_id = s.id
   where s.status = 'published'
     and s.visibility = 'public'
     and (s.publish_at is null or s.publish_at <= now())
     and s.starts_at > now()
   group by s.id;
$$;

grant execute on function public_session_slots() to anon, authenticated;
