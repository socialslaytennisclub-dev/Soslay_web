-- "Siapa boleh menghidupkan booking batal" dipindah ke satu fungsi dan dinilai dari SIAPA yang
-- men-check-in (checked_in_by), bukan dari login pemanggil (auth.uid()) — supaya hasilnya sama
-- lewat RPC, script, maupun klien service-role. Aturan berikutnya cukup mengubah fungsi ini,
-- tanpa menyalin ulang seluruh session_participant_sync.

/** Check-in oleh `p_by` boleh menghidupkan booking batal `p_member`: dicatat orang lain, atau yang
 *  men-check-in dirinya sendiri adalah panitia (staf aktif / host sesi ini). */
create function can_revive_booking(p_session uuid, p_member uuid, p_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_by is distinct from p_member
      or exists (select 1 from staff_members where user_id = p_by and status = 'active')
      or exists (select 1 from session_hosts where session_id = p_session and member_id = p_by and role = 'host');
$$;
revoke execute on function can_revive_booking(uuid, uuid, uuid) from public, anon, authenticated;

-- Sama dengan versi 20261105000000, kecuali syarat menghidupkan booking batal → can_revive_booking.
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
      and (status <> 'cancelled' or (new.checked_in_at is not null and can_revive_booking(new.session_id, new.member_id, new.checked_in_by)))
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;
