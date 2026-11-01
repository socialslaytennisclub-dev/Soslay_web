-- Venue yang disembunyikan dari halaman Venue tetap bisa dibaca bila dipakai sesi yang terlihat.
-- Sebelumnya sesi di venue tersembunyi (mis. venue baru yang belum ditampilkan) hilang dari
-- website & My Activity karena join venues kosong. Daftar venue publik tetap memfilter is_active.

/** Venue dipakai minimal satu sesi yang boleh dibaca pemanggil (RLS sessions berlaku). */
create function venue_has_visible_session(p_venue uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from sessions s where s.venue_id = p_venue);
$$;

drop policy "public read venues" on venues;
create policy "public read venues" on venues for select using (
  is_active or (select has_permission('venues')) or venue_has_visible_session(id)
);
