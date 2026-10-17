-- Daftar member admin dihitung di database: filter, cari, urut & halaman langsung di query,
-- jadi halaman Members tidak perlu memuat semua member + booking + order ke server app.
-- security_invoker → RLS profiles/bookings tetap berlaku (hanya staf dengan izin members).
-- Status turunan sama dengan app: "Tidak aktif" = belum main 60 hari, kecuali member baru (< 30 hari).

create view admin_member_list with (security_invoker = true) as
select
  p.id,
  p.member_code,
  p.full_name,
  p.email,
  coalesce(p.kuy_id::text, '')    as kuy_id,
  coalesce(p.instagram::text, '') as instagram,
  coalesce(p.city, '')            as city,
  coalesce(p.tennis_level, 'beginner') as tennis_level,
  p.play_frequency,
  p.looking_for,
  p.event_types,
  p.tier,
  p.joined_at,
  case
    when p.status = 'suspended' then 'suspended'::member_status
    when (st.last_played_at is null or st.last_played_at < now() - interval '60 days')
      and p.joined_at <= now() - interval '30 days' then 'inactive'::member_status
    else 'active'::member_status
  end as status,
  st.sessions_attended,
  st.points_balance,
  st.last_played_at,
  -- Teks pencarian (nama, email, Kuy ID, Instagram, no. member) — cocok dengan index trigram profiles.
  lower(p.full_name || ' ' || p.email::text || ' ' || coalesce(p.kuy_id::text, '') || ' ' || coalesce(p.instagram::text, '') || ' ' || p.member_code) as search
from profiles p
join member_stats st on st.member_id = p.id;

grant select on admin_member_list to authenticated;
