-- Identitas peserta: ID Soslay (nomor member) jadi ID utama, lalu Kuy ID, lalu Reclub ID.
-- Peserta kini bisa ditambahkan admin secara manual (selain impor Kuyy) → kolom `source`.

alter table session_participants
  add column source text not null default 'kuy' check (source in ('kuy', 'admin'));

-- Booking member mengikuti sumber pesertanya (impor Kuyy / ditambah admin).
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
    where session_id = new.session_id and member_id = new.member_id and status <> 'cancelled'
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;

/** ID Soslay tanpa spasi/tanda baca, huruf besar — "SOS 0541 2610", "sos-0541-2610" → "SOS05412610". */
create function compact_member_code(code text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;
create index profiles_member_code_compact_idx on profiles (compact_member_code(member_code));
