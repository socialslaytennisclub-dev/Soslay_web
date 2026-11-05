-- Rotating Partner tidak memakai target poin: match tidak harus berakhir di total tertentu, skor
-- diisi bebas sesuai hasil di lapangan (mis. 6–4). Americano tetap: total kedua tim = target poin.
-- Sama dengan web/src/lib/americano.ts (hasTargetTotal).
create or replace function save_match_score(p_match uuid, p_score_a smallint, p_score_b smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_target  smallint;
  v_format  match_format;
  v_ended   timestamptz;
begin
  select m.session_id, s.target_points, s.match_format, s.ended_at into v_session, v_target, v_format, v_ended
  from session_matches m join sessions s on s.id = m.session_id where m.id = p_match;
  if v_session is null then raise exception 'Match tidak ditemukan'; end if;
  if not can_run_session(v_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_ended is not null and not has_permission('settings', 'edit') then raise exception 'Sesi sudah diakhiri — skor terkunci'; end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'Skor tidak valid';
  end if;
  if v_format = 'rotating' then
    if p_score_a + p_score_b = 0 then raise exception 'Skor masih 0–0'; end if;
  elsif p_score_a + p_score_b <> v_target then
    raise exception 'Total poin harus %', v_target;
  end if;
  update session_matches
  set score_a = p_score_a, score_b = p_score_b, scored_by = auth.uid(), scored_at = now()
  where id = p_match;
end $$;
revoke execute on function save_match_score(uuid, smallint, smallint) from anon;
