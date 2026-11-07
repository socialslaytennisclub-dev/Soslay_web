-- Koreksi hasil activity yang sudah berakhir (diminta 7 Nov): admin bisa mengganti line-up & skor di
-- ronde mana pun, lalu bonus juara dihitung ulang. Sesi tetap berstatus selesai (tidak dibuka lagi →
-- tidak ditutup ulang oleh close_expired_sessions). Bonus lama TIDAK dihapus: selisihnya dicatat
-- sebagai baris koreksi di points_ledger, jadi riwayat poin member tetap bisa diaudit.

-- Bonus juara sekarang ditandai sesinya, supaya bisa dihitung ulang tanpa menebak dari catatan.
alter table points_ledger add column session_id uuid references sessions(id) on delete set null;
create index points_ledger_session_idx on points_ledger (session_id) where session_id is not null;

-- Data lama: bonus juara yang sudah ada → sesi lewat booking-nya, atau (tanpa booking) lewat judul
-- sesi di catatan + member memang peserta sesi itu (hanya kalau cocok dengan tepat satu sesi).
update points_ledger l set session_id = b.session_id
from bookings b
where l.reason = 'bonus' and l.session_id is null and l.note like 'Bonus juara #%' and b.id = l.booking_id;

update points_ledger l set session_id = c.session_id
from (
  select l2.id, min(s.id::text)::uuid as session_id
  from points_ledger l2
  join sessions s on l2.note = format('Bonus juara #%s · %s', substring(l2.note from '#(\d+)'), s.title)
  join session_participants sp on sp.session_id = s.id and sp.member_id = l2.member_id
  where l2.reason = 'bonus' and l2.session_id is null and l2.booking_id is null and l2.note like 'Bonus juara #%'
    and s.ended_at is not null
  group by l2.id
  having count(distinct s.id) = 1
) c
where l.id = c.id;

/** Peringkat juara 1–3 per member dari skor sesi saat ini (sama dengan web/src/lib/standings.ts). */
create function session_podium(p_session uuid)
returns table (member_id uuid, rk int) language sql stable security definer set search_path = public as $$
  select distinct on (sp.member_id) sp.member_id, r.rk::int
  from (
    select pid, rank() over (order by
             case when s.leaderboard_mode = 'wins' then array[wins, diff, pts] else array[pts, diff, wins] end desc) as rk
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
    cross join (select leaderboard_mode from sessions where id = p_session) s
  ) r
  join session_participants sp on sp.id = r.pid
  where r.rk <= 3 and sp.member_id is not null
  order by sp.member_id, r.rk;
$$;
revoke execute on function session_podium(uuid) from public, anon, authenticated;

create function podium_bonus(p_rank int) returns integer language sql immutable as $$
  select case p_rank when 1 then 100 when 2 then 75 when 3 then 50 else 0 end
$$;

-- Tutup sesi: sama seperti 20261107040000_rank_score_diff, kini lewat session_podium + menandai session_id.
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
  select p.member_id, podium_bonus(p.rk), 'bonus',
         (select b.id from bookings b where b.session_id = p_session and b.member_id = p.member_id limit 1),
         p_session, format('Bonus juara #%s · %s', p.rk, v_s.title)
  from session_podium(p_session) p;
end $$;
revoke execute on function finish_session(uuid, uuid, timestamptz) from public, anon, authenticated;

/**
 * Simpan koreksi hasil sesi yang sudah berakhir: seluruh line-up + skor diganti dengan p_matches
 * (round_no, court_no, a1, a2, b1, b2 = id session_participants, score_a, score_b — skor boleh null =
 * match tidak dimainkan), lalu bonus juara disesuaikan. Hanya admin activities (bukan host).
 * Mengembalikan jumlah member yang bonusnya berubah.
 */
create function correct_session_result(p_session uuid, p_matches jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_bad text;
  v_changed integer;
begin
  if not has_permission('activities', 'edit') then raise exception 'Hanya admin yang bisa mengoreksi hasil'; end if;
  select * into v_s from sessions where id = p_session for update;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if v_s.ended_at is null and v_s.status <> 'completed' then raise exception 'Sesi belum berakhir — atur line-up & skor seperti biasa'; end if;

  drop table if exists correction;
  create temp table correction on commit drop as
  select * from jsonb_to_recordset(coalesce(p_matches, '[]'))
    as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid, score_a smallint, score_b smallint);

  if exists (select 1 from correction where round_no < 1 or round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Ronde / court di luar format sesi (% ronde · % court)', v_s.round_count, v_s.court_count;
  end if;
  select format('Ronde %s · Court %s', round_no, court_no) into v_bad from correction group by round_no, court_no having count(*) > 1 limit 1;
  if v_bad is not null then raise exception '% tercatat dua kali', v_bad; end if;
  select format('Ronde %s · Court %s', c.round_no, c.court_no) into v_bad
  from correction c, unnest(array[c.a1, c.a2, c.b1, c.b2]) p(id)
  where p.id is null or not exists (select 1 from session_participants sp where sp.id = p.id and sp.session_id = p_session)
  limit 1;
  if v_bad is not null then raise exception 'Ada pemain di % yang bukan peserta sesi ini', v_bad; end if;
  select format('Ronde %s', round_no) into v_bad
  from correction c, unnest(array[c.a1, c.a2, c.b1, c.b2]) p(id)
  group by round_no, p.id having count(*) > 1 limit 1;
  if v_bad is not null then raise exception 'Ada pemain yang main dua kali di %', v_bad; end if;

  select format('Ronde %s · Court %s', round_no, court_no) into v_bad from correction
  where (score_a is null) <> (score_b is null) or score_a < 0 or score_b < 0
     or (score_a is not null and v_s.match_format = 'americano' and score_a + score_b <> v_s.target_points)
     or (score_a is not null and v_s.match_format <> 'americano' and score_a + score_b = 0)
  limit 1;
  if v_bad is not null then
    raise exception 'Skor % tidak valid%', v_bad,
      case when v_s.match_format = 'americano' then format(' — total poin harus %s', v_s.target_points) else ' — skor tidak boleh 0–0' end;
  end if;

  delete from session_matches where session_id = p_session;
  insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2, score_a, score_b, scored_by, scored_at)
  select p_session, round_no, court_no, a1, a2, b1, b2, score_a, score_b,
         case when score_a is not null then auth.uid() end, case when score_a is not null then now() end
  from correction;

  -- Bonus juara: target dari skor baru dikurangi bonus yang sudah tercatat untuk sesi ini.
  with target as (
    select member_id, rk, podium_bonus(rk) as pts from session_podium(p_session)
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
revoke execute on function correct_session_result(uuid, jsonb) from public, anon;
grant execute on function correct_session_result(uuid, jsonb) to authenticated;
