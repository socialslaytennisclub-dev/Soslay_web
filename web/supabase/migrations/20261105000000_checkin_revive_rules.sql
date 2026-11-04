-- Aturan lanjutan "check-in menghidupkan booking batal" (20261104000000):
-- 1. Hanya panitia (admin / host) yang bisa menghidupkan booking batal. Member yang membatalkan
--    bookingnya tidak bisa check-in mandiri (bisa jadi sudah di-refund) — minta panitia.
-- 2. Booking yang dihidupkan lalu keluar dari "hadir" ke status apa pun (registered, no_show)
--    kembali ke cancelled, bukan hanya lewat registered.

create or replace function bookings_revive_marker() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'cancelled' and new.status = 'attended' then
    new.revived_from_cancelled := true;
  elsif old.status = 'attended' and new.status <> 'attended' and old.revived_from_cancelled then
    new.status := 'cancelled';
    new.revived_from_cancelled := false;
  elsif new.status = 'cancelled' then
    new.revived_from_cancelled := false;
  end if;
  return new;
end $$;

-- Sama dengan versi 20261104000000, kecuali: booking cancelled hanya dihidupkan bila yang
-- men-check-in bukan member itu sendiri (check-in mandiri ditolak di member_self_check_in).
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
      and (status <> 'cancelled' or (new.checked_in_at is not null and new.checked_in_by is distinct from new.member_id))
      and status is distinct from (case when new.checked_in_at is null then 'registered'::booking_status else 'attended'::booking_status end);
  end if;
  return new;
end $$;

-- Sama dengan versi terakhir, ditambah penolakan untuk booking yang dibatalkan.
create or replace function member_self_check_in(p_session uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s sessions%rowtype;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'Masuk dulu untuk check-in'; end if;
  select * into v_s from sessions where id = p_session;
  if not found or v_s.status in ('draft', 'cancelled') then raise exception 'Sesi tidak ditemukan'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' or now() > session_closes_at(v_s.ends_at) then raise exception 'Sesi sudah selesai'; end if;
  -- Dibuka 30 menit sebelum jadwal — atau sejak sesi di-live-kan lebih awal oleh admin.
  if now() < least(v_s.starts_at - interval '30 minutes', coalesce(v_s.live_started_at, 'infinity')) then
    raise exception 'Check-in dibuka 30 menit sebelum sesi';
  end if;
  if exists (select 1 from bookings where session_id = p_session and member_id = v_uid and status = 'cancelled') then
    raise exception 'Booking kamu untuk sesi ini sudah dibatalkan — minta panitia untuk check-in';
  end if;

  -- Baris peserta milik member (booking website tanpa baris peserta dibuatkan); bukan peserta → ditolak.
  perform session_participant_for(p_session, v_uid);
  update session_participants
  set checked_in_at = now(), checked_in_by = v_uid
  where session_id = p_session and member_id = v_uid and checked_in_at is null;

  select min(checked_in_at) into v_at from session_participants where session_id = p_session and member_id = v_uid;
  return v_at;
end $$;
