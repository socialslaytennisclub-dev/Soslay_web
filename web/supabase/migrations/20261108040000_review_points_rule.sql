-- Poin review sesi bisa diatur di admin (Slay Point → Aturan poin → "Review sesi"), diminta 8 Nov.
-- Sebelumnya tetap +10 di submit_session_review. Aturan disimpan di app_settings points_rules
-- bonuses[key=review] (sama seperti bonus member baru); belum pernah disimpan → +10 (default lama).
-- Hanya berlaku untuk review baru — poin review yang sudah diberikan tidak diubah.
-- Host yang ditunjuk untuk sesi (walau tidak ikut main / tanpa booking) juga bisa memberi review.

/** Poin untuk review pertama sebuah sesi: 0 kalau dimatikan. Dibaca juga halaman member (teks "+N"). */
create function review_bonus_points() returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when coalesce((b ->> 'enabled')::boolean, true) then greatest(coalesce((b ->> 'points')::integer, 0), 0) else 0 end
       from app_settings, jsonb_array_elements(value -> 'bonuses') b
      where key = 'points_rules' and b ->> 'key' = 'review'
      limit 1),
    10);
$$;
grant execute on function review_bonus_points() to anon, authenticated;

-- Sama dengan versi 20261101000000_session_close_grace, kecuali jumlah poin dari review_bonus_points() dan
-- host sesi (is_assigned_host) boleh memberi review.
create or replace function submit_session_review(
  p_session uuid, p_rating smallint, p_highlights text[], p_host smallint, p_venue smallint, p_format smallint,
  p_comment text, p_testimonial boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_end timestamptz;
  v_booking uuid;
  v_new boolean;
  v_points integer;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  v_end := coalesce(v_s.ended_at, session_closes_at(v_s.ends_at));
  if v_s.ended_at is null and v_s.status <> 'completed' and session_closes_at(v_s.ends_at) > now() then raise exception 'Review dibuka setelah sesi selesai'; end if;
  if now() > v_end + interval '7 days' then raise exception 'Review sudah terkunci (lewat 7 hari)'; end if;
  if not exists (select 1 from session_participants where session_id = p_session and member_id = auth.uid())
     and not exists (select 1 from bookings where session_id = p_session and member_id = auth.uid() and status in ('registered', 'attended'))
     and not is_assigned_host(p_session) then
    raise exception 'Hanya peserta atau host sesi ini yang bisa memberi review';
  end if;

  -- xmax = 0 → baris baru (bukan update): poin hanya untuk insert pertama, aman dari kiriman bersamaan.
  insert into session_reviews (session_id, member_id, rating, highlights, host_rating, venue_rating, format_rating, comment, testimonial)
  values (p_session, auth.uid(), p_rating, coalesce(p_highlights, '{}'), p_host, p_venue, p_format, nullif(trim(p_comment), ''), coalesce(p_testimonial, false))
  on conflict (session_id, member_id) do update
  set rating = excluded.rating, highlights = excluded.highlights, host_rating = excluded.host_rating,
      venue_rating = excluded.venue_rating, format_rating = excluded.format_rating, comment = excluded.comment,
      testimonial = excluded.testimonial, updated_at = now()
  returning (xmax = 0) into v_new;

  v_points := review_bonus_points();
  if v_new and v_points > 0 then
    select id into v_booking from bookings where session_id = p_session and member_id = auth.uid() limit 1;
    insert into points_ledger (member_id, delta, reason, booking_id, note)
    values (auth.uid(), v_points, 'bonus', v_booking, format('Review sesi · %s', v_s.title));
  end if;
end $$;
