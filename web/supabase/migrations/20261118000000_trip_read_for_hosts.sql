-- Host trip (session_hosts peran host di activity trip) mendapat card trip di My Activities dan
-- halaman trip member: mereka perlu membaca trip (juga yang visibility "link") dan rundown-nya.
-- Rundown untuk host selalu terbaca (mereka yang menjalankan acara), walau show_rundown dimatikan.

drop policy if exists "read trips" on trips;
create policy "read trips" on trips for select using (
  (select has_permission('activities'))
  or (status = 'published' and (
    visibility = 'public'
    or (visibility = 'members' and (select auth.uid()) is not null)
    or exists (select 1 from trip_bookings b where b.trip_id = trips.id and b.member_id = (select auth.uid()) and b.cancelled_at is null)
    or exists (select 1 from sessions s join bookings bk on bk.session_id = s.id where s.trip_id = trips.id and bk.member_id = (select auth.uid()) and bk.status <> 'cancelled')
    or exists (select 1 from sessions s join session_hosts h on h.session_id = s.id where s.trip_id = trips.id and h.member_id = (select auth.uid()) and h.role = 'host')
  ))
);

drop policy if exists "read trip rundown" on trip_rundown_items;
create policy "read trip rundown" on trip_rundown_items for select using (
  (select has_permission('activities'))
  or exists (
    select 1 from trips t join trip_bookings b on b.trip_id = t.id
    where t.id = trip_rundown_items.trip_id and t.show_rundown and t.status = 'published'
      and b.member_id = (select auth.uid()) and b.cancelled_at is null
  )
  or exists (
    select 1 from trips t join sessions s on s.trip_id = t.id join session_hosts h on h.session_id = s.id
    where t.id = trip_rundown_items.trip_id and t.status = 'published'
      and h.member_id = (select auth.uid()) and h.role = 'host'
  )
);
