-- Jumlah ronde / court sesi dikurangi (mis. 9 → 6 ronde) → line-up ronde / court yang tidak ada lagi
-- (belum ada skornya) ikut dihapus. Dulu tertinggal: halaman host tetap menampilkan R7–R9 dan
-- "Simpan line-up" ditolak "Ronde / court di luar format sesi". Ronde / court yang sudah ada skornya,
-- atau ronde yang sudah dimulai, tidak boleh dibuang → pengurangan ditolak dengan pesan yang jelas.
create function sessions_trim_lineup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from session_matches
    where session_id = new.id and score_a is not null and (round_no > new.round_count or court_no > new.court_count)
  ) then
    raise exception 'Sudah ada skor di ronde / court yang mau dihapus — jumlah ronde / court minimal sampai yang sudah ada skornya.'
      using hint = 'lineup_scored';
  end if;
  -- Ronde yang sedang / sudah dimulai (Mulai Ronde) juga tidak boleh dibuang walau belum ada skornya.
  if new.round_count < old.round_count and (
    coalesce(new.current_round, 0) > new.round_count
    or exists (select 1 from unnest(new.started_rounds) r where r > new.round_count)
  ) then
    raise exception 'Ronde % sudah dimulai — jumlah ronde minimal sampai ronde yang sudah dimulai.',
      greatest(coalesce(new.current_round, 0), coalesce((select max(r) from unnest(new.started_rounds) r), 0))
      using hint = 'lineup_started';
  end if;
  delete from session_matches
  where session_id = new.id and score_a is null and (round_no > new.round_count or court_no > new.court_count);
  return null;
end $$;
create trigger sessions_trim_lineup after update of round_count, court_count on sessions
  for each row when (new.round_count < old.round_count or new.court_count < old.court_count)
  execute function sessions_trim_lineup();

-- Data lama: line-up yang sudah terlanjur di luar format (belum ada skornya), hanya activity yang belum
-- selesai — riwayat activity yang sudah selesai tidak diubah.
delete from session_matches m
using sessions s
where s.id = m.session_id and m.score_a is null and (m.round_no > s.round_count or m.court_no > s.court_count)
  and s.ended_at is null and s.status <> 'completed';

-- Pesan host yang lebih jelas bila halaman masih memakai format lama.
create or replace function host_save_lineup(p_session uuid, p_from_round smallint, p_matches jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_matches jsonb;
  v_bad text;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri — line-up terkunci'; end if;

  if exists (select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint) where round_no < p_from_round or round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Jumlah ronde / court sesi sudah diubah (% ronde · % court) — muat ulang halaman lalu atur line-up lagi', v_s.round_count, v_s.court_count;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'round_no', l.round_no, 'court_no', l.court_no,
           'a1', session_participant_for(p_session, l.a1), 'a2', session_participant_for(p_session, l.a2),
           'b1', session_participant_for(p_session, l.b1), 'b2', session_participant_for(p_session, l.b2))), '[]')
  into v_matches
  from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid);

  delete from session_matches where session_id = p_session and round_no >= p_from_round and score_a is null;
  insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2)
  select p_session, l.round_no, l.court_no, l.a1, l.a2, l.b1, l.b2
  from jsonb_to_recordset(v_matches) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid)
  where not exists (select 1 from session_matches m where m.session_id = p_session and m.round_no = l.round_no and m.court_no = l.court_no);

  select format('Ronde %s', round_no) into v_bad
  from session_matches m, unnest(array[m.a1, m.a2, m.b1, m.b2]) p(id)
  where m.session_id = p_session
  group by round_no, p.id having count(*) > 1 limit 1;
  if v_bad is not null then raise exception 'Ada pemain yang main dua kali di %', v_bad; end if;
end $$;
