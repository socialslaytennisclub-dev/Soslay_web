-- Satu definisi "staf": staf AKTIF. session_participant_sync mencatat checked_in_by booking bila
-- pencentangnya staf — sebelumnya baris staff_members apa pun (juga yang dinonaktifkan), sementara
-- is_session_crew hanya menghitung staf aktif. Keduanya kini memakai is_active_staff.

create function is_active_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_members where user_id = p_user and status = 'active');
$$;
revoke execute on function is_active_staff(uuid) from public, anon, authenticated;

create or replace function is_session_crew(p_session uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_active_staff(p_user)
      or exists (select 1 from session_hosts where session_id = p_session and member_id = p_user and role = 'host');
$$;

-- Sama dengan versi 20261105010000, kecuali checked_in_by booking → is_active_staff.
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
        checked_in_by = case when is_active_staff(new.checked_in_by) then new.checked_in_by end
    where session_id = new.session_id and member_id = new.member_id
      and (status <> 'cancelled' or (new.checked_in_at is not null and can_revive_booking(new.session_id, new.member_id, new.checked_in_by)))
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;
