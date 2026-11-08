-- Poin kehadiran: SEKALI per member per activity (diminta 7 Nov). Sebelumnya kuncinya per booking —
-- kalau booking member itu dihapus lalu dibuat lagi (impor ulang / hapus peserta / trip), baris poin
-- lama kehilangan booking_id-nya dan check-in berikutnya memberi poin lagi. Sekarang kuncinya
-- sesi + member, jadi check-in dobel, batal check-in lalu check-in lagi, atau booking baru untuk
-- activity yang sama tetap hanya memberi satu kali poin. Catatan poin kini menyebut nama activity.
-- Butuh points_ledger.session_id (20261108000000_session_result_correction).

update points_ledger l set session_id = b.session_id
from bookings b
where l.reason = 'attendance' and l.session_id is null and b.id = l.booking_id;

-- Baris poin yang booking-nya sudah terhapus (booking_id NULL): sesi ditebak dari activity berpoin milik
-- member itu (peserta / booking) yang BELUM punya poin kehadirannya, paling akhir dimulai sebelum poin
-- dicatat (+1 jam, check-in dibuka 30 menit sebelum mulai). Tanpa batas bawah — check-in susulan admin
-- beberapa hari kemudian tetap ketemu — dan activity yang sudah punya poin kehadiran dilewati, jadi
-- tebakan tidak jatuh ke activity lama yang sudah tercatat. Tidak ada kandidat → session_id tetap NULL.
update points_ledger l set session_id = g.session_id
from (
  -- Dua baris yatim yang menunjuk sesi yang sama → hanya satu yang diisi (sisanya tetap NULL).
  select distinct on (member_id, session_id) id, member_id, session_id from (
  select distinct on (o.id) o.id, o.member_id, s.id as session_id
  from points_ledger o
  join sessions s on s.starts_at <= o.created_at + interval '1 hour' and s.points_per_attendance > 0
  where o.reason = 'attendance' and o.session_id is null and o.booking_id is null
    and not exists (select 1 from points_ledger x where x.reason = 'attendance' and x.member_id = o.member_id and x.session_id = s.id)
    and (exists (select 1 from session_participants sp where sp.session_id = s.id and sp.member_id = o.member_id)
         or exists (select 1 from bookings b where b.session_id = s.id and b.member_id = o.member_id))
  order by o.id, s.starts_at desc
  ) guess
  order by member_id, session_id, id
) g
where l.id = g.id
  and not exists (select 1 from points_ledger x where x.reason = 'attendance' and x.member_id = l.member_id and x.session_id = g.session_id);

update points_ledger l set note = format('Hadir di sesi · %s', s.title)
from sessions s
where l.reason = 'attendance' and l.note = 'Hadir di sesi' and s.id = l.session_id;

create unique index points_attendance_once_per_session on points_ledger (member_id, session_id)
  where reason = 'attendance' and session_id is not null;

create or replace function bookings_award_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
begin
  if new.status = 'attended' and (old.status is distinct from 'attended') then
    select * into v_s from sessions where id = new.session_id;
    if v_s.points_per_attendance > 0 then
      insert into points_ledger (member_id, delta, reason, booking_id, session_id, note)
      values (new.member_id, v_s.points_per_attendance, 'attendance', new.id, new.session_id, format('Hadir di sesi · %s', v_s.title))
      on conflict do nothing;
    end if;
  elsif old.status = 'attended' and new.status is distinct from 'attended' then
    delete from points_ledger
    where reason = 'attendance' and member_id = new.member_id and (session_id = new.session_id or booking_id = new.id);
  end if;
  return new;
end $$;
