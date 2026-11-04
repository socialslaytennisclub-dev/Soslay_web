-- Check-in peserta menghidupkan booking member yang dulu dibatalkan (orangnya ternyata datang),
-- dan batal check-in mengembalikannya ke "dibatalkan" — di satu tempat (database), jadi admin,
-- host (Panel Host), peserta susulan & check-in langsung di bookings berperilaku sama.
-- Sebelumnya session_participant_sync melewati booking cancelled → Hadir tanpa poin, dan
-- perbaikan di kode aplikasi tidak menjangkau host_set_check_in.

alter table bookings
  add column revived_from_cancelled boolean not null default false;

/** Ingat booking yang dihidupkan dari cancelled; batal hadir → kembali cancelled (bukan registered). */
create function bookings_revive_marker() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'cancelled' and new.status = 'attended' then
    new.revived_from_cancelled := true;
  elsif old.status = 'attended' and new.status = 'registered' and old.revived_from_cancelled then
    new.status := 'cancelled';
    new.revived_from_cancelled := false;
  elsif new.status = 'cancelled' then
    new.revived_from_cancelled := false;
  end if;
  return new;
end $$;
create trigger bookings_revive_marker before update of status on bookings
  for each row execute function bookings_revive_marker();

-- Sama dengan versi 20261025010000, kecuali: check-in juga memperbarui booking cancelled.
create or replace function session_participant_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is null then
    return new;
  end if;
  insert into bookings (session_id, member_id, status, payment_status, source, amount)
  values (new.session_id, new.member_id, 'registered', 'paid', (case when new.source = 'admin' then 'admin' else 'kuy' end)::booking_source, new.amount)
  on conflict (session_id, member_id) do nothing;
  if tg_op = 'INSERT' or new.checked_in_at is distinct from old.checked_in_at or new.member_id is distinct from old.member_id then
    update bookings
    set status = case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end,
        checked_in_at = new.checked_in_at,
        checked_in_by = case when new.checked_in_by is not null and exists (select 1 from staff_members where user_id = new.checked_in_by) then new.checked_in_by end
    where session_id = new.session_id and member_id = new.member_id
      and (status <> 'cancelled' or new.checked_in_at is not null)
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;
