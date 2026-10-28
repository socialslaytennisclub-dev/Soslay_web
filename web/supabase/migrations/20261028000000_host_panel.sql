-- Panel Host di member web (Figma UIF-09): member yang ditunjuk sebagai host bisa membuka detail
-- sesinya walau tidak ikut main (tanpa booking), melihat line-up & peserta, input skor, dan
-- mengurungkan skor yang baru disimpan.

/** Ditunjuk sebagai host sesi ini (peran host), terlepas dari sesi sudah selesai atau belum —
 *  untuk hak BACA. Hak menulis tetap lewat is_session_host / can_run_session (hanya selama sesi aktif). */
create function is_assigned_host(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from session_hosts h
    where h.session_id = p_session and h.member_id = auth.uid() and h.role = 'host'
  );
$$;
revoke execute on function is_assigned_host(uuid) from anon;

create policy "host read hosted sessions" on sessions for select using (is_assigned_host(id));
create policy "host read hosted matches" on session_matches for select using (is_assigned_host(session_id));

-- Roster: host yang ditunjuk ikut boleh membaca (juga setelah sesi selesai).
create or replace function session_roster(p_session uuid)
returns table (id uuid, member_id uuid, name text, tennis_level tennis_level, source text, checked_in boolean)
language sql stable security definer set search_path = public as $$
  select r.*
  from (
    select p.id, p.member_id, coalesce(pr.full_name, p.full_name) as name, coalesce(pr.tennis_level, p.tennis_level) as tennis_level, p.source, p.checked_in_at is not null as checked_in
    from session_participants p
    left join profiles pr on pr.id = p.member_id
    where p.session_id = p_session
    union all
    -- Booking website tanpa baris peserta (member daftar sendiri): id = member_id.
    select b.member_id, b.member_id, pr.full_name, pr.tennis_level, b.source::text, b.status = 'attended'
    from bookings b
    join profiles pr on pr.id = b.member_id
    where b.session_id = p_session and b.status <> 'cancelled'
      and not exists (select 1 from session_participants p where p.session_id = p_session and p.member_id = b.member_id)
  ) r
  -- Hak akses dicek sekali per panggilan (subquery tanpa korelasi → InitPlan).
  where (select is_session_member(p_session) or is_assigned_host(p_session) or has_permission('activities'));
$$;

/** "Urungkan" dari Panel Host: kosongkan skor match (aturan sama dengan save_match_score). */
create function clear_match_score(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_ended timestamptz;
begin
  select m.session_id, s.ended_at into v_session, v_ended
  from session_matches m join sessions s on s.id = m.session_id where m.id = p_match;
  if v_session is null then raise exception 'Match tidak ditemukan'; end if;
  if not can_run_session(v_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_ended is not null and not has_permission('settings', 'edit') then raise exception 'Sesi sudah diakhiri — skor terkunci'; end if;
  update session_matches set score_a = null, score_b = null, scored_by = null, scored_at = null where id = p_match;
end $$;
revoke execute on function clear_match_score(uuid) from anon;
