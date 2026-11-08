-- Bonus juara per activity (diminta 8 Nov): tiap activity punya aturan sendiri, diatur di Admin → Edit
-- activity → Format & skor → "Bonus juara". Default activity baru: juara 1 = 10, juara 2 = 0, juara 3 = 0.
-- Activity yang sudah selesai tetap tercatat 100 / 75 / 50 (yang memang sudah dibagikan), supaya
-- "Koreksi hasil" tidak menarik bonus lama. Peringkat 0 poin → tidak ada baris bonus.

alter table sessions add column podium_bonus integer[] not null default '{10,0,0}'
  check (array_length(podium_bonus, 1) = 3 and 0 <= all (podium_bonus) and 10000 >= all (podium_bonus));
update sessions set podium_bonus = '{100,75,50}' where ended_at is not null or status = 'completed';

-- Sama dengan 20261108000000_session_result_correction, kecuali bonus dari sessions.podium_bonus.
create or replace function finish_session(p_session uuid, p_by uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
begin
  update sessions set ended_at = p_at, ended_by = p_by, status = 'completed'
  where id = p_session and ended_at is null and status <> 'completed'
  returning * into v_s;
  if not found then return; end if;

  insert into points_ledger (member_id, delta, reason, booking_id, session_id, note)
  select p.member_id, v_s.podium_bonus[p.rk], 'bonus',
         (select b.id from bookings b where b.session_id = p_session and b.member_id = p.member_id limit 1),
         p_session, format('Bonus juara #%s · %s', p.rk, v_s.title)
  from session_podium(p_session) p
  where coalesce(v_s.podium_bonus[p.rk], 0) > 0;
end $$;

-- Sama dengan 20261108030000_correction_where_clause, kecuali bonus dari sessions.podium_bonus.
create or replace function correct_session_result(p_session uuid, p_matches jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_bad text;
  v_changed integer;
begin
  if not has_permission('activities', 'edit') then raise exception 'Hanya admin yang bisa mengoreksi hasil'; end if;
  select * into v_s from sessions where id = p_session for update;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not session_is_finished(v_s) then raise exception 'Sesi belum berakhir — atur line-up & skor seperti biasa'; end if;

  -- Selalu pg_temp.* (fungsi SECURITY DEFINER): nama tanpa skema bisa jatuh ke tabel public.
  drop table if exists pg_temp.correction;
  create temp table correction on commit drop as
  select * from jsonb_to_recordset(coalesce(p_matches, '[]'))
    as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid, score_a smallint, score_b smallint);

  -- Slot berisi member id = peserta booking tanpa baris peserta → baris peserta dibuat lewat
  -- session_participant_for (sama dengan line-up host), hanya untuk pemain yang dipakai dan di transaksi
  -- ini: kalau koreksi ditolak, baris pesertanya ikut batal. Bukan peserta → ditolak.
  update pg_temp.correction set
    a1 = session_participant_for(p_session, a1), a2 = session_participant_for(p_session, a2),
    b1 = session_participant_for(p_session, b1), b2 = session_participant_for(p_session, b2)
  where true; -- Supabase (pg_safeupdate) menolak UPDATE tanpa WHERE: "UPDATE requires a WHERE clause"

  if exists (select 1 from pg_temp.correction where round_no < 1 or round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Ronde / court di luar format sesi (% ronde · % court)', v_s.round_count, v_s.court_count;
  end if;
  select format('Ronde %s · Court %s', round_no, court_no) into v_bad from pg_temp.correction group by round_no, court_no having count(*) > 1 limit 1;
  if v_bad is not null then raise exception '% tercatat dua kali', v_bad; end if;
  select format('Ronde %s', round_no) into v_bad
  from pg_temp.correction c, unnest(array[c.a1, c.a2, c.b1, c.b2]) p(id)
  group by round_no, p.id having count(*) > 1 limit 1;
  if v_bad is not null then raise exception 'Ada pemain yang main dua kali di %', v_bad; end if;

  select format('Ronde %s · Court %s', round_no, court_no) into v_bad from pg_temp.correction
  where (score_a is null) <> (score_b is null) or score_a < 0 or score_b < 0
     or (score_a is not null and v_s.match_format = 'americano' and score_a + score_b <> v_s.target_points)
     or (score_a is not null and v_s.match_format <> 'americano' and score_a + score_b = 0)
  limit 1;
  if v_bad is not null then
    raise exception 'Skor % tidak valid%', v_bad,
      case when v_s.match_format = 'americano' then format(' — total poin harus %s', v_s.target_points) else ' — skor tidak boleh 0–0' end;
  end if;

  -- Match yang tidak berubah (court, pemain & skor sama) tetap mencatat siapa / kapan skornya diinput.
  drop table if exists pg_temp.previous_matches;
  create temp table previous_matches on commit drop as
  select round_no, court_no, a1, a2, b1, b2, score_a, score_b, scored_by, scored_at from session_matches where session_id = p_session;

  delete from session_matches where session_id = p_session;
  insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2, score_a, score_b, scored_by, scored_at)
  select p_session, c.round_no, c.court_no, c.a1, c.a2, c.b1, c.b2, c.score_a, c.score_b,
         case when c.score_a is null then null when o.round_no is not null then o.scored_by else auth.uid() end,
         case when c.score_a is null then null when o.round_no is not null then o.scored_at else now() end
  from pg_temp.correction c
  left join pg_temp.previous_matches o
    on (o.round_no, o.court_no, o.a1, o.a2, o.b1, o.b2, o.score_a, o.score_b)
       is not distinct from (c.round_no, c.court_no, c.a1, c.a2, c.b1, c.b2, c.score_a, c.score_b);

  -- Bonus juara: target dari skor baru dikurangi bonus yang sudah tercatat untuk sesi ini.
  with target as (
    select member_id, rk, coalesce(v_s.podium_bonus[rk], 0) as pts from session_podium(p_session)
  ), current_bonus as (
    select member_id, sum(delta)::int as pts from points_ledger
    where session_id = p_session and reason = 'bonus' group by member_id
  ), diff as (
    select coalesce(t.member_id, c.member_id) as member_id, t.rk,
           coalesce(t.pts, 0) - coalesce(c.pts, 0) as delta
    from target t full join current_bonus c on c.member_id = t.member_id
  ), ins as (
    insert into points_ledger (member_id, delta, reason, booking_id, session_id, note, created_by)
    select d.member_id, d.delta, 'bonus',
           (select b.id from bookings b where b.session_id = p_session and b.member_id = d.member_id limit 1),
           p_session,
           format('Koreksi bonus juara · %s · %s', v_s.title, case when d.rk is null then 'tidak lagi juara' else format('kini juara #%s', d.rk) end),
           (select user_id from staff_members where user_id = auth.uid())
    from diff d where d.delta <> 0
    returning 1
  )
  select count(*) into v_changed from ins;
  return v_changed;
end $$;

drop function podium_bonus(integer);
