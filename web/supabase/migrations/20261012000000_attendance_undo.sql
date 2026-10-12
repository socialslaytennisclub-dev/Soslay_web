-- Check-in bisa dibatalkan admin (salah tap di lapangan): poin kehadiran ikut ditarik.
-- Menggantikan bookings_award_points(): tetap memberi poin saat status → attended,
-- dan menghapus baris poin kehadiran booking itu saat status keluar dari attended.
-- SECURITY DEFINER: admin Activities tidak punya hak hapus di points_ledger.
create or replace function bookings_award_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pts integer;
begin
  if new.status = 'attended' and (old.status is distinct from 'attended') then
    select points_per_attendance into pts from sessions where id = new.session_id;
    if pts > 0 then
      insert into points_ledger (member_id, delta, reason, booking_id, note)
      values (new.member_id, pts, 'attendance', new.id, 'Hadir di sesi')
      on conflict do nothing;
    end if;
  elsif old.status = 'attended' and new.status is distinct from 'attended' then
    delete from points_ledger where booking_id = new.id and reason = 'attendance';
  end if;
  return new;
end $$;
