-- Panel Host · ronde berurutan & pindah otomatis (Figma Soslay Development 1284:6086, 23 Nov 2026).
--
-- · Skor court terakhir ronde live masuk (host atau admin) → ronde berikutnya otomatis live. Ronde terakhir
--   tidak pindah ke mana-mana; activity tetap diakhiri lewat "Akhiri Activity".
-- · "Mulai Ronde" hanya ke ronde tepat setelah ronde live (Lanjut saat ada court yang macet) — tidak bisa
--   melompat lagi, jadi tidak ada ronde "Dilewati" baru. Ronde yang dulu sudah terlanjur dilewati (sebelum
--   aturan ini) tetap bisa dimulai supaya masuk hasil.
-- · Urungkan / ubah skor tidak memundurkan ronde: ronde lama jadi "belum lengkap" dan tetap bisa diisi
--   (masuk leaderboard selama activity belum diakhiri).
-- · Host tidak bisa input skor ronde yang belum dimulai (admin tetap bisa dari halaman Activities).

-- Ronde live efektif: current_round, atau — bila belum pernah diisi (sesi live otomatis di jam jadwal) —
-- sama dengan currentRoundOf di web/src/lib/rounds.ts (dicek di check-migrations).
create function session_live_round(p_session uuid)
returns smallint language plpgsql stable security definer set search_path = public as $$
declare
  v_cur smallint;
  v_last smallint;
begin
  select current_round into v_cur from sessions where id = p_session;
  if v_cur is not null then return v_cur; end if;
  select max(round_no) into v_last from session_matches where session_id = p_session and score_a is not null;
  if v_last is null then
    select min(round_no) into v_cur from session_matches where session_id = p_session;
  elsif exists (select 1 from session_matches where session_id = p_session and round_no = v_last and score_a is null) then
    v_cur := v_last;
  else
    select coalesce(min(round_no), v_last) into v_cur from session_matches
    where session_id = p_session and round_no > v_last and score_a is null;
  end if;
  return v_cur;
end $$;
revoke execute on function session_live_round(uuid) from public, anon, authenticated;

-- Ronde berikutnya di line-up setelah `p_round` (null = sudah ronde terakhir).
create function session_next_round(p_session uuid, p_round smallint)
returns smallint language sql stable security definer set search_path = public as $$
  select min(round_no) from session_matches where session_id = p_session and round_no > coalesce(p_round, 0);
$$;
revoke execute on function session_next_round(uuid, smallint) from public, anon, authenticated;

create or replace function save_match_score(p_match uuid, p_score_a smallint, p_score_b smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_round   smallint;
  v_target  smallint;
  v_format  match_format;
  v_ended   boolean;
  v_live    boolean;
  v_started smallint[];
  v_cur     smallint;
  v_next    smallint;
begin
  select m.session_id, m.round_no, s.target_points, s.match_format, session_is_finished(s),
         s.live_started_at is not null or s.starts_at <= now(), s.started_rounds
  into v_session, v_round, v_target, v_format, v_ended, v_live, v_started
  from session_matches m join sessions s on s.id = m.session_id where m.id = p_match;
  if v_session is null then raise exception 'Match tidak ditemukan'; end if;
  if not can_run_session(v_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_ended then raise exception 'Sesi sudah diakhiri — skor terkunci. Admin: pakai "Koreksi hasil".'; end if;
  -- Kunci sesi: dua court terakhir yang disimpan bersamaan diproses bergantian, jadi yang kedua melihat
  -- court pertama sudah berskor dan ronde tetap pindah otomatis. Status ronde & sesi dibaca ulang setelah
  -- kunci (ronde bisa baru saja pindah / "Lanjut" dari perangkat lain).
  select s.started_rounds, session_is_finished(s) into v_started, v_ended from sessions s where s.id = v_session for update;
  if v_ended then raise exception 'Sesi sudah diakhiri — skor terkunci. Admin: pakai "Koreksi hasil".'; end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'Skor tidak valid';
  end if;
  -- Hanya Americano yang memakai target total; format lain (Rotating Partner) skor bebas, asal bukan 0–0.
  if v_format = 'americano' then
    if p_score_a + p_score_b <> v_target then raise exception 'Total poin harus %', v_target using hint = 'score_total'; end if;
  elsif p_score_a + p_score_b = 0 then
    raise exception 'Skor masih 0–0' using hint = 'score_zero';
  end if;

  v_cur := session_live_round(v_session);
  -- Host: ronde setelah ronde live yang belum pernah dimulai masih terkunci.
  if not has_permission('activities', 'edit') and v_round > coalesce(v_cur, 0) and not (v_round = any (coalesce(v_started, '{}'))) then
    raise exception 'Ronde % belum dimulai', v_round using hint = 'round_unstarted';
  end if;

  update session_matches
  set score_a = p_score_a, score_b = p_score_b, scored_by = auth.uid(), scored_at = now()
  where id = p_match;

  -- Court terakhir ronde live berskor → ronde berikutnya live.
  if v_live and v_round = v_cur
     and not exists (select 1 from session_matches where session_id = v_session and round_no = v_round and score_a is null) then
    v_next := session_next_round(v_session, v_round);
    if v_next is not null then
      update sessions
      set current_round = v_next,
          started_rounds = (select array_agg(distinct r order by r) from unnest(started_rounds || v_round || v_next) r where r is not null),
          live_started_at = coalesce(live_started_at, now())
      where id = v_session;
    end if;
  end if;
end $$;

-- "Lanjut ke Ronde N" (ronde live macet): hanya ke ronde tepat setelah ronde live.
create or replace function start_session_round(p_session uuid, p_round smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_cur smallint;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not has_permission('activities', 'edit') then
    if session_closes_at(v_s.ends_at) < now() then raise exception 'Sesi sudah diakhiri'; end if;
    if v_s.live_started_at is null and v_s.starts_at > now() then raise exception 'Sesi belum dimulai'; end if;
  end if;
  if not exists (select 1 from session_matches where session_id = p_session and round_no = p_round) then
    raise exception 'Ronde % belum ada di line-up', p_round;
  end if;

  v_cur := session_live_round(p_session);
  -- Ronde live itu sendiri (dicatat ulang, idempoten), ronde tepat sesudahnya, atau ronde lama yang dulu
  -- dilompati (sebelum ronde live, belum pernah dimulai & belum ada skor) supaya tetap bisa dimainkan.
  if p_round is distinct from v_cur and p_round is distinct from session_next_round(p_session, v_cur)
     and not (p_round < v_cur and not (p_round = any (coalesce(v_s.started_rounds, '{}')))
              and not exists (select 1 from session_matches where session_id = p_session and round_no = p_round and score_a is not null)) then
    raise exception 'Ronde berjalan berurutan — ronde berikutnya: %', session_next_round(p_session, v_cur) using hint = 'round_sequence';
  end if;

  update sessions
  set current_round = p_round,
      started_rounds = (select array_agg(distinct r order by r) from unnest(started_rounds || v_cur || p_round) r where r is not null),
      live_started_at = coalesce(live_started_at, now())
  where id = p_session;
end $$;
