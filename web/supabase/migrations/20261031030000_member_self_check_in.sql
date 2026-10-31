-- Check-in mandiri member (/akun/absensi): peserta yang login menandai dirinya hadir, hanya selama
-- jendela check-in (30 menit sebelum mulai — atau sejak di-live-kan lebih awal — s.d. jadwal selesai)
-- dan selama sesi belum diakhiri.
-- Hasilnya sama dengan check-in host: baris peserta hadir → booking 'attended' (+poin hadir) lewat
-- trigger session_participant_sync. Membatalkan check-in tetap hanya lewat host / admin.

create function member_self_check_in(p_session uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s sessions%rowtype;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'Masuk dulu untuk check-in'; end if;
  select * into v_s from sessions where id = p_session;
  if not found or v_s.status in ('draft', 'cancelled') then raise exception 'Sesi tidak ditemukan'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' or now() > v_s.ends_at then raise exception 'Sesi sudah selesai'; end if;
  -- Dibuka 30 menit sebelum jadwal — atau sejak sesi di-live-kan lebih awal oleh admin.
  if now() < least(v_s.starts_at - interval '30 minutes', coalesce(v_s.live_started_at, 'infinity')) then
    raise exception 'Check-in dibuka 30 menit sebelum sesi';
  end if;

  -- Baris peserta milik member (booking website tanpa baris peserta dibuatkan); bukan peserta → ditolak.
  perform session_participant_for(p_session, v_uid);
  update session_participants
  set checked_in_at = now(), checked_in_by = v_uid
  where session_id = p_session and member_id = v_uid and checked_in_at is null;

  select min(checked_in_at) into v_at from session_participants where session_id = p_session and member_id = v_uid;
  return v_at;
end $$;
revoke execute on function member_self_check_in(uuid) from public, anon;
grant execute on function member_self_check_in(uuid) to authenticated;
