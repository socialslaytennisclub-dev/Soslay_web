-- Bonus juara untuk peserta yang baru jadi member SESUDAH activity ditutup (ditemukan 9 Nov: Fredy, juara 1
-- Candor Court 8 Nov, daftar akun 9 Nov). finish_session membagi bonus hanya ke baris peserta yang sudah
-- tertaut ke member; tamu Kuyy yang menang lalu daftar akun memang mendapat poin kehadiran susulan (booking
-- ikut "attended"), tapi bonus juaranya terlewat. Sekarang:
--  · baris peserta activity yang sudah selesai yang baru tertaut ke member (atau ditambahkan sesudah selesai)
--    → bonus juara member itu dibagikan, kalau peringkatnya dapat bonus dan belum pernah menerimanya;
--  · sekali jalan di sini: semua activity yang sudah selesai dicek, bonus yang terlewat dibagikan susulan.
-- Bonus mengikuti aturan activity (sessions.podium_bonus; NULL = aturan lama 100 / 75 / 50) & peringkat saat ini.

/** Bagikan bonus juara yang belum diterima member di activity yang sudah selesai; jumlah baris baru. */
create function award_missing_podium(p_session uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_n integer;
begin
  select * into v_s from sessions where id = p_session;
  if not found or (v_s.ended_at is null and v_s.status <> 'completed') then return 0; end if;
  insert into points_ledger (member_id, delta, reason, booking_id, session_id, note, is_podium)
  select p.member_id, (session_podium_bonus(v_s.podium_bonus))[p.rk], 'bonus',
         (select b.id from bookings b where b.session_id = p_session and b.member_id = p.member_id limit 1),
         p_session, format('Bonus juara #%s · %s', p.rk, v_s.title), true
  from session_podium(p_session) p
  where coalesce((session_podium_bonus(v_s.podium_bonus))[p.rk], 0) > 0
    and not exists (select 1 from points_ledger l where l.session_id = p_session and l.member_id = p.member_id and l.is_podium)
    -- Bonus juara lama yang tidak tertaut ke activity (session_id kosong, judul sama) → anggap sudah dibagikan.
    and not exists (select 1 from points_ledger l where l.session_id is null and l.member_id = p.member_id and l.is_podium
                      and l.note like '%· ' || replace(replace(v_s.title, '%', '\%'), '_', '\_'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function award_missing_podium(uuid) from public, anon, authenticated;

create function session_participants_late_podium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform award_missing_podium(new.session_id);
  return null;
end $$;
-- Ditunda sampai akhir transaksi (constraint trigger): di dalam Koreksi hasil, baris peserta baru dibuat
-- SEBELUM skor diganti — bonus dihitung dari skor akhir, bukan skor lama (tanpa baris bonus + koreksi).
-- Hanya saat member benar-benar baru tertaut (impor ulang Kuyy dengan member sama tidak memicu apa-apa).
create constraint trigger session_participants_late_podium_insert after insert on session_participants
  deferrable initially deferred
  for each row when (new.member_id is not null)
  execute function session_participants_late_podium();
create constraint trigger session_participants_late_podium_link after update of member_id on session_participants
  deferrable initially deferred
  for each row when (new.member_id is not null and old.member_id is distinct from new.member_id)
  execute function session_participants_late_podium();

-- Susulan untuk activity yang sudah selesai.
select award_missing_podium(id) from sessions where ended_at is not null or status = 'completed';
