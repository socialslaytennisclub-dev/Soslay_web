-- Persempit venue tersembunyi yang terbaca publik: hanya lewat sesi yang tampil di website
-- (jendela 120 hari = PAST_WINDOW_DAYS di web/src/server/public/sessions.ts), atau sesi milik
-- pemanggil (booking / host) untuk My Activity. Security definer + indeks sessions (venue_id,
-- starts_at) → satu pencarian berindeks per venue, bukan semua kebijakan RLS sessions per baris.
create or replace function venue_has_visible_session(p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
    where s.venue_id = p_venue
      and s.starts_at >= now() - interval '120 days'
      and s.status in ('published', 'completed')
      and (s.publish_at is null or s.publish_at <= now())
      and (s.visibility = 'public' or (s.visibility = 'members' and auth.uid() is not null))
  )
  or (auth.uid() is not null and (
    exists (
      select 1 from bookings b join sessions s on s.id = b.session_id
      where s.venue_id = p_venue and b.member_id = auth.uid() and b.status <> 'cancelled'
    )
    or exists (
      select 1 from session_hosts h join sessions s on s.id = h.session_id
      where s.venue_id = p_venue and h.member_id = auth.uid() and h.role = 'host'
    )
  ));
$$;

drop policy "public read venues" on venues;
create policy "public read venues" on venues for select using (
  is_active or (select has_permission('venues')) or venue_has_visible_session(id)
);
