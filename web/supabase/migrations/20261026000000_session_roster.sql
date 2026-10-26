-- Daftar peserta untuk halaman detail sesi member (tab Peserta / Live / Ronde / Leaderboard).
-- Hanya nama, level, sumber daftar & status hadir — email / nomor HP tetap tertutup RLS.
-- Boleh dipanggil peserta sesi itu, host-nya, atau tim admin; selain itu hasilnya kosong.
create function session_roster(p_session uuid)
returns table (id uuid, member_id uuid, name text, tennis_level tennis_level, source text, checked_in boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.member_id, coalesce(pr.full_name, p.full_name), coalesce(pr.tennis_level, p.tennis_level), p.source, p.checked_in_at is not null
  from session_participants p
  left join profiles pr on pr.id = p.member_id
  where p.session_id = p_session
    and (is_session_member(p_session) or is_session_host(p_session) or has_permission('activities'))
  union all
  -- Booking website tanpa baris peserta (member daftar sendiri).
  select b.member_id, b.member_id, pr.full_name, pr.tennis_level, b.source::text, b.status = 'attended'
  from bookings b
  join profiles pr on pr.id = b.member_id
  where b.session_id = p_session and b.status <> 'cancelled'
    and not exists (select 1 from session_participants p where p.session_id = p_session and p.member_id = b.member_id)
    and (is_session_member(p_session) or is_session_host(p_session) or has_permission('activities'));
$$;
revoke execute on function session_roster(uuid) from anon;
