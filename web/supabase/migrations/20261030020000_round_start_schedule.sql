-- Mulai Ronde (UIF-13) mengikuti jadwal yang sama dengan member web (phaseOf): host hanya bisa
-- memulai ronde saat sesi sedang berjalan — belum mulai (sebelum starts_at, belum di-live-kan
-- admin) atau sudah lewat ends_at / completed → ditolak. Admin tetap bebas (mis. mulai lebih awal).
-- Karena itu ronde live turunan (current_round kosong) yang ikut dicatat memang sudah tampil live.

create or replace function start_session_round(p_session uuid, p_round smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_prev smallint;
  v_last smallint;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not has_permission('activities', 'edit') then
    if v_s.ends_at < now() then raise exception 'Sesi sudah diakhiri'; end if;
    if v_s.live_started_at is null and v_s.starts_at > now() then raise exception 'Sesi belum dimulai'; end if;
  end if;
  if not exists (select 1 from session_matches where session_id = p_session and round_no = p_round) then
    raise exception 'Ronde % belum ada di line-up', p_round;
  end if;

  v_prev := v_s.current_round;
  if v_prev is null then
    select max(round_no) into v_last from session_matches where session_id = p_session and score_a is not null;
    if v_last is null then
      select min(round_no) into v_prev from session_matches where session_id = p_session;
    elsif exists (select 1 from session_matches where session_id = p_session and round_no = v_last and score_a is null) then
      v_prev := v_last;
    else
      select coalesce(min(round_no), v_last) into v_prev from session_matches
      where session_id = p_session and round_no > v_last and score_a is null;
    end if;
  end if;

  update sessions
  set current_round = p_round,
      started_rounds = (select array_agg(distinct r order by r) from unnest(started_rounds || v_prev || p_round) r where r is not null),
      live_started_at = coalesce(live_started_at, now())
  where id = p_session;
end $$;
revoke execute on function start_session_round(uuid, smallint) from anon;
