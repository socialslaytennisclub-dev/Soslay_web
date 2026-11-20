-- Slay Rally (/game) sebagai user acquisition (20 Nov 2026):
--  · Ronde 1 bebas untuk siapa saja; ronde 2 dst. wajib akun member (gerbang di klien, lihat SlayRally.tsx).
--  · Skor tiap game member disimpan di game_scores lewat RPC submit_game_score (bukan insert langsung).
--  · Slay Point: setiap 100 poin game (akumulasi semua game, sisa terbawa) = 1 Slay Point, maksimal
--    GAME_DAILY_POINT_CAP (10) Slay Point per hari WIB. Dicatat di points_ledger reason 'bonus', note "Slay Rally · …".
--    Angka sama di web/src/lib/game.ts — ubah keduanya bersamaan (dicek di check-migrations).
--  · Skor dikirim dari browser, jadi dicek masuk akal terhadap durasi main (≤ 20 + 15/detik, level ≤ 1 + durasi/8 dtk)
--    dan jeda antar kiriman ≥ 10 detik.
--  · Leaderboard publik: skor terbaik per member aktif, nama tampilan (atau nama depan) + foto saja.

create table game_scores (
  id              bigint generated always as identity primary key,
  member_id       uuid not null references profiles(id) on delete cascade,
  game            text not null default 'slay_rally' check (game = 'slay_rally'),
  score           integer not null check (score between 0 and 100000),
  level           integer not null check (level between 1 and 1000),
  duration_ms     integer not null check (duration_ms >= 0),
  points_awarded  integer not null default 0 check (points_awarded >= 0),
  created_at      timestamptz not null default now()
);
create index game_scores_member_idx on game_scores (member_id, created_at desc);
create index game_scores_best_idx on game_scores (game, score desc, created_at);

-- Member hanya membaca skornya sendiri; tulis lewat RPC.
alter table game_scores enable row level security;
create policy "member read own game scores" on game_scores for select using (member_id = auth.uid() or has_permission('members'));

create function submit_game_score(p_score integer, p_level integer, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_cap constant integer := 10;     -- GAME_DAILY_POINT_CAP
  c_rate constant integer := 100;   -- GAME_POINTS_PER_SLAY_POINT
  v_member uuid := auth.uid();
  v_secs numeric := greatest(coalesce(p_duration_ms, 0), 0) / 1000.0;
  v_total bigint;
  v_awarded bigint;
  v_today integer;
  v_new integer;
  v_best integer;
begin
  if v_member is null or not exists (select 1 from profiles where id = v_member and status <> 'suspended') then
    raise exception 'not_member';
  end if;
  if p_score is null or p_level is null or p_score < 0 or p_level < 1 then
    raise exception 'invalid_score';
  end if;
  if p_score > 20 + v_secs * 15 or p_level > 1 + floor(v_secs / 8) then
    raise exception 'implausible_score';
  end if;
  -- Satu member tidak bisa mengirim dua kali bersamaan (klik ganda / dua tab).
  perform pg_advisory_xact_lock(hashtext('game_scores:' || v_member::text));
  if exists (select 1 from game_scores where member_id = v_member and created_at > now() - interval '10 seconds') then
    raise exception 'too_fast';
  end if;

  select coalesce(sum(score), 0), coalesce(sum(points_awarded), 0) into v_total, v_awarded
  from game_scores where member_id = v_member;
  select coalesce(sum(points_awarded), 0) into v_today
  from game_scores
  where member_id = v_member and (created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date;

  v_new := greatest(0, least(((v_total + p_score) / c_rate) - v_awarded, c_cap - v_today))::integer;

  insert into game_scores (member_id, score, level, duration_ms, points_awarded)
  values (v_member, p_score, p_level, p_duration_ms, v_new);

  if v_new > 0 then
    insert into points_ledger (member_id, delta, reason, note)
    values (v_member, v_new, 'bonus', format('Slay Rally · skor %s', p_score));
  end if;

  select max(score) into v_best from game_scores where member_id = v_member;
  return jsonb_build_object(
    'points_awarded', v_new,
    'best', v_best,
    -- Poin game yang belum jadi Slay Point (menuju 100 berikutnya).
    'carry', ((v_total + p_score) - (v_awarded + v_new) * c_rate)::integer,
    'today_awarded', v_today + v_new,
    'daily_cap', c_cap
  );
end;
$$;
revoke execute on function submit_game_score(integer, integer, integer) from public, anon;
grant execute on function submit_game_score(integer, integer, integer) to authenticated;

-- Top N skor terbaik per member + baris milik pemanggil bila di luar top N.
create function game_leaderboard(p_limit integer default 10)
returns table (rank integer, name text, photo text, best integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (g.member_id) g.member_id, g.score, g.created_at
    from game_scores g
    join profiles p on p.id = g.member_id and p.status = 'active'
    where g.game = 'slay_rally' and g.score > 0
    order by g.member_id, g.score desc, g.created_at
  ),
  ranked as (
    select b.*, (row_number() over (order by b.score desc, b.created_at))::integer as rk from best b
  )
  select r.rk,
         coalesce(nullif(trim(p.display_name), ''), split_part(trim(p.full_name), ' ', 1)),
         p.avatar_path,
         r.score,
         r.member_id = auth.uid()
  from ranked r join profiles p on p.id = r.member_id
  where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 50) or r.member_id = auth.uid()
  order by r.rk;
$$;
grant execute on function game_leaderboard(integer) to anon, authenticated;
