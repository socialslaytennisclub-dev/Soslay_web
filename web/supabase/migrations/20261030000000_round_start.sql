-- Host Mulai & Lompat Ronde (Figma UIF-13 / MOB-11): host memilih ronde lalu "Mulai Ronde".
-- Ronde yang dimulai dicatat di started_rounds; ronde bernomor lebih kecil yang belum pernah
-- dimulai (dan belum berskor) tampil "Dilewati" dan jadi pilihan default berikutnya.

alter table sessions add column started_rounds smallint[] not null default '{}';

/** Mulai satu ronde: jadi ronde live (current_round). Hanya admin / host aktif, sesi belum diakhiri. */
create function start_session_round(p_session uuid, p_round smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ended timestamptz;
begin
  select ended_at into v_ended from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_ended is not null then raise exception 'Sesi sudah diakhiri'; end if;
  if not exists (select 1 from session_matches where session_id = p_session and round_no = p_round) then
    raise exception 'Ronde % belum ada di line-up', p_round;
  end if;
  update sessions
  set current_round = p_round,
      started_rounds = (select array_agg(distinct r order by r) from unnest(started_rounds || p_round) r),
      live_started_at = coalesce(live_started_at, now())
  where id = p_session;
end $$;
revoke execute on function start_session_round(uuid, smallint) from anon;
