-- Slay Rally (/game) sebagai user acquisition (20 Nov 2026):
--  · Ronde 1 bebas untuk siapa saja; ronde 2 dst. wajib akun member (gerbang di klien, lihat SlayRally.tsx).
--  · Setiap game member dibuka dengan start_game_session() → waktu mulai dicatat SERVER. Skor dikirim
--    sekali per sesi lewat submit_game_score(sesi, skor, level); lama main dihitung dari server, bukan
--    dari browser, sehingga skor tidak bisa diklaim dengan durasi palsu.
--  · Batas masuk akal (lihat engine.ts: 1–2 poin per blok, +10 per ronde, maks. 50 blok per ronde):
--      skor ≤ 150 + 10 × detik   (150 = cadangan skor ronde 1 tamu yang dibawa setelah daftar)
--      skor ≤ 110 × level        (2 × 50 blok + 10)
--      level ≤ 2 + detik / 3     (+1 = ronde yang dibuka dari simpanan tamu)
--    Sesi berlaku 3 jam dan hanya bisa dikirim sekali.
--  · Slay Point: setiap 100 poin game (akumulasi semua game, sisa terbawa) = 1 Slay Point, maksimal
--    GAME_DAILY_POINT_CAP (10) Slay Point per hari WIB. Dicatat di points_ledger reason 'bonus', note "Slay Rally · …".
--    Angka sama di web/src/lib/game.ts — ubah keduanya bersamaan (dicek di check-migrations).
--  · Leaderboard publik: skor terbaik per member (kecuali suspended — sama dengan syarat kirim skor),
--    nama tampilan (atau nama depan) + foto saja.

create table game_sessions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz
);
create index game_sessions_member_idx on game_sessions (member_id, started_at desc);
-- Tanpa policy: hanya lewat RPC.
alter table game_sessions enable row level security;

create table game_scores (
  id              bigint generated always as identity primary key,
  member_id       uuid not null references profiles(id) on delete cascade,
  session_id      uuid unique references game_sessions(id) on delete set null,
  game            text not null default 'slay_rally' check (game = 'slay_rally'),
  score           integer not null check (score between 0 and 100000),
  level           integer not null check (level between 1 and 1000),
  duration_ms     integer not null check (duration_ms >= 0),
  points_awarded  integer not null default 0 check (points_awarded >= 0),
  created_at      timestamptz not null default now()
);
create index game_scores_member_idx on game_scores (member_id, created_at desc);
-- Skor terbaik per member (leaderboard: DISTINCT ON member_id ORDER BY score DESC).
create index game_scores_member_best_idx on game_scores (member_id, score desc, created_at);

-- Member hanya membaca skornya sendiri; tulis lewat RPC.
alter table game_scores enable row level security;
create policy "member read own game scores" on game_scores for select using (member_id = auth.uid() or has_permission('members'));

create function game_member_ok(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_member is not null and exists (select 1 from profiles where id = p_member and status <> 'suspended');
$$;
revoke execute on function game_member_ok(uuid) from public, anon, authenticated;

create function start_game_session()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := auth.uid();
  v_id uuid;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  -- Sesi lama yang tidak pernah dikirim tidak berguna lagi.
  delete from game_sessions where member_id = v_member and submitted_at is null and started_at < now() - interval '1 day';
  insert into game_sessions (member_id) values (v_member) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function start_game_session() from public, anon;
grant execute on function start_game_session() to authenticated;

create function submit_game_score(p_session uuid, p_score integer, p_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_cap constant integer := 10;     -- GAME_DAILY_POINT_CAP
  c_rate constant integer := 100;   -- GAME_POINTS_PER_SLAY_POINT
  v_member uuid := auth.uid();
  v_session game_sessions%rowtype;
  v_secs numeric;
  v_total bigint;
  v_awarded bigint;
  v_today integer;
  v_new integer;
  v_best integer;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  if p_score is null or p_level is null or p_score < 0 or p_level < 1 then
    raise exception 'invalid_score';
  end if;
  -- Satu member: pemberian poin berurutan (dua tab / dua sesi tidak menghitung saldo yang sama).
  perform pg_advisory_xact_lock(hashtext('game_scores:' || v_member::text));

  select * into v_session from game_sessions where id = p_session and member_id = v_member for update;
  if not found then
    raise exception 'invalid_session';
  end if;
  if v_session.submitted_at is not null then
    raise exception 'already_submitted';
  end if;
  if v_session.started_at < now() - interval '3 hours' then
    raise exception 'session_expired';
  end if;

  v_secs := extract(epoch from now() - v_session.started_at);
  if p_score > 150 + v_secs * 10 or p_score > 110 * p_level or p_level > 2 + floor(v_secs / 3) then
    raise exception 'implausible_score';
  end if;

  update game_sessions set submitted_at = now() where id = v_session.id;

  select coalesce(sum(score), 0), coalesce(sum(points_awarded), 0) into v_total, v_awarded
  from game_scores where member_id = v_member;
  select coalesce(sum(points_awarded), 0) into v_today
  from game_scores
  where member_id = v_member and (created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date;

  v_new := greatest(0, least(((v_total + p_score) / c_rate) - v_awarded, c_cap - v_today))::integer;

  insert into game_scores (member_id, session_id, score, level, duration_ms, points_awarded)
  values (v_member, v_session.id, p_score, p_level, (v_secs * 1000)::integer, v_new);

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
revoke execute on function submit_game_score(uuid, integer, integer) from public, anon;
grant execute on function submit_game_score(uuid, integer, integer) to authenticated;

-- Top N skor terbaik per member + baris milik pemanggil bila di luar top N.
create function game_leaderboard(p_limit integer default 10)
returns table (rank integer, name text, photo text, best integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (g.member_id) g.member_id, g.score, g.created_at
    from game_scores g
    where g.game = 'slay_rally' and g.score > 0
    order by g.member_id, g.score desc, g.created_at
  ),
  ranked as (
    select b.*, (row_number() over (order by b.score desc, b.created_at))::integer as rk
    from best b
    join profiles p on p.id = b.member_id and p.status <> 'suspended'
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
