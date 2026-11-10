-- Review sesi terlihat oleh peserta & host activity itu (diminta 9 Nov) — sebelumnya member hanya bisa
-- membaca review miliknya sendiri. Tanpa membuka tabel (RLS tetap "milik sendiri"): fungsi ini hanya
-- mengembalikan review sebuah activity kepada peserta (booking aktif / baris peserta) atau host-nya, juga
-- admin Activities. Nama ditampilkan sebagai nama depan; flag testimoni & kontak tidak ikut; rating Host
-- orang lain disembunyikan (hanya pemberi review & admin yang melihat).

create function session_reviews_for(p_session uuid)
returns table (
  member_id uuid, name text, is_host boolean, rating integer, host_rating integer, venue_rating integer,
  format_rating integer, highlights text[], comment text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.member_id,
         coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Member'),
         exists (select 1 from session_hosts h where h.session_id = r.session_id and h.member_id = r.member_id and h.role = 'host'),
         r.rating,
         -- Rating Host hanya untuk pemberi review sendiri & admin: host dan peserta lain tidak melihat siapa
         -- memberi bintang berapa untuk host (supaya penilaian tetap jujur).
         case when r.member_id = auth.uid() or has_permission('activities', 'view') then r.host_rating end,
         r.venue_rating, r.format_rating, r.highlights, r.comment, r.updated_at
  from session_reviews r
  left join profiles p on p.id = r.member_id
  where r.session_id = p_session
    and (
      is_assigned_host(p_session)
      or has_permission('activities', 'view')
      or exists (select 1 from session_participants sp where sp.session_id = p_session and sp.member_id = auth.uid())
      or exists (select 1 from bookings b where b.session_id = p_session and b.member_id = auth.uid() and b.status in ('registered', 'attended'))
    )
  order by r.updated_at desc;
$$;
revoke execute on function session_reviews_for(uuid) from public, anon;
grant execute on function session_reviews_for(uuid) to authenticated;
