-- Peserta bundling yang didaftarkan admin sebagai tamu (nama + no. HP) → otomatis ditautkan ke akunnya
-- begitu ia menjadi member dengan nomor HP yang sama, seperti tamu activity (claim_ghost_member).
-- member_id terisi → trip_bookings_sync menautkan baris peserta di semua activity trip (booking, kehadiran, poin).
-- Satu paket per trip per member (trip_bookings_member_unique): bila ada lebih dari satu baris tamu dengan nomor
-- yang sama di satu trip, hanya yang paling awal yang ditautkan.
create function claim_trip_bookings_for_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := normalize_phone(new.phone);
begin
  if v_phone is null then
    return new;
  end if;

  with picked as (
    select distinct on (b.trip_id) b.id
    from trip_bookings b
    where b.member_id is null and b.cancelled_at is null
      and normalize_phone(b.phone) = v_phone
      and not exists (
        select 1 from trip_bookings x
        where x.trip_id = b.trip_id and x.member_id = new.id and x.cancelled_at is null
      )
    order by b.trip_id, b.created_at
  )
  update trip_bookings b set member_id = new.id, full_name = new.full_name
  from picked where b.id = picked.id;

  -- Activity trip yang sudah ia ikuti lewat jalur lain (mis. tamu activity yang barusan diklaim) tidak ikut
  -- ditautkan trip_add_bundle_participants → buang baris tamu paket yang tersisa agar tidak dobel.
  delete from session_participants p
  using trip_bookings b
  where b.member_id = new.id and b.cancelled_at is null
    and p.kuy_reg_no = 'T-' || b.id and p.member_id is null
    and exists (select 1 from session_participants o where o.session_id = p.session_id and o.member_id = new.id);

  return new;
end $$;

-- Dinamai setelah profiles_claim_ghost (trigger berurutan abjad) → tamu activity sudah diklaim lebih dulu.
create trigger profiles_claim_trip_bookings after insert on profiles
  for each row execute function claim_trip_bookings_for_profile();

revoke all on function claim_trip_bookings_for_profile() from public, anon, authenticated;

-- Backfill: tamu bundling yang SUDAH menjadi member sebelum trigger ini ada (mis. didaftarkan sebelum ia sign up)
-- → tautkan sekarang. Hanya bila nomornya milik tepat satu profil & member itu belum punya paket di trip tsb.
with matches as (
  select b.id as booking_id, b.trip_id, b.created_at, min(p.id::text)::uuid as profile_id, count(*) as n
  from trip_bookings b
  join profiles p on normalize_phone(p.phone) = normalize_phone(b.phone)
  where b.member_id is null and b.cancelled_at is null and normalize_phone(b.phone) is not null
  group by b.id, b.trip_id, b.created_at
),
picked as (
  select distinct on (m.trip_id, m.profile_id) m.booking_id, m.profile_id
  from matches m
  where m.n = 1
    and not exists (
      select 1 from trip_bookings x
      where x.trip_id = m.trip_id and x.member_id = m.profile_id and x.cancelled_at is null
    )
  order by m.trip_id, m.profile_id, m.created_at
)
update trip_bookings b set member_id = picked.profile_id, full_name = p.full_name
from picked join profiles p on p.id = picked.profile_id
where b.id = picked.booking_id;

-- Baris tamu paket yang tertinggal di activity yang sudah diikuti member itu lewat jalur lain → buang (anti dobel).
delete from session_participants p
using trip_bookings b
where b.member_id is not null and b.cancelled_at is null
  and p.kuy_reg_no = 'T-' || b.id and p.member_id is null
  and exists (select 1 from session_participants o where o.session_id = p.session_id and o.member_id = b.member_id);
