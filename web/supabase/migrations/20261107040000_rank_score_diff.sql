-- Penentu peringkat kalau nilai sama: selisih skor (skor sendiri − lawan). Mode Point = total poin →
-- selisih → menang; mode Win = menang → selisih → total poin. Contoh: dua pemain sama-sama 48 poin →
-- yang selisihnya lebih besar (lebih produktif) juara di atas. Sama dengan web/src/lib/standings.ts
-- (RANK_ORDER). Isi fungsi selain urutan rank() sama persis dengan 20261101000000_session_close_grace.

create or replace function finish_session(p_session uuid, p_by uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
begin
  update sessions set ended_at = p_at, ended_by = p_by, status = 'completed'
  where id = p_session and ended_at is null and status <> 'completed'
  returning * into v_s;
  if not found then return; end if;

  insert into points_ledger (member_id, delta, reason, booking_id, note)
  select distinct on (sp.member_id)
         sp.member_id,
         case r.rk when 1 then 100 when 2 then 75 else 50 end,
         'bonus',
         (select b.id from bookings b where b.session_id = p_session and b.member_id = sp.member_id limit 1),
         format('Bonus juara #%s · %s', r.rk, v_s.title)
  from (
    select pid, rank() over (order by
             case when v_s.leaderboard_mode = 'wins' then array[wins, diff, pts] else array[pts, diff, wins] end desc) as rk
    from (
      select pid, sum(own) as pts, sum(own - opp) as diff, count(*) filter (where own > opp) as wins
      from (
        select m.score_a as own, m.score_b as opp, unnest(array[m.a1, m.a2]) as pid
        from session_matches m where m.session_id = p_session and m.score_a is not null
        union all
        select m.score_b, m.score_a, unnest(array[m.b1, m.b2])
        from session_matches m where m.session_id = p_session and m.score_a is not null
      ) sides
      group by pid
    ) agg
  ) r
  join session_participants sp on sp.id = r.pid
  where r.rk <= 3 and sp.member_id is not null
  order by sp.member_id, r.rk;
end $$;
revoke execute on function finish_session(uuid, uuid, timestamptz) from public, anon, authenticated;
