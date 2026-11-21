-- Slay Rally: Slay Point dari leaderboard BULANAN (21 Nov 2026), menggantikan konversi 100 poin game = 1 SP.
--  · Leaderboard dihitung per bulan kalender WIB (skor terbaik tiap member bulan itu), reset tiap tanggal 1.
--  · Saat bulan berakhir, 3 besar bulan itu mendapat hadiah: juara 1 = 20, juara 2 = 10, juara 3 = 5
--    Slay Point (GAME_MONTHLY_PRIZES di web/src/lib/game.ts — ubah keduanya bersamaan, dicek di
--    check-migrations). Dicatat di points_ledger reason 'bonus', note "Slay Rally · juara N · MM/YYYY".
--  · Tanpa cron: game_settle_months() membayar bulan-bulan yang sudah lewat & belum dibayar, dipanggil
--    otomatis setiap kali skor dikirim atau leaderboard dibuka. Satu bulan dibayar tepat sekali
--    (game_month_settled + primary key game_month_prizes).
--  · Urutan seri: skor sama → yang lebih dulu mencapainya di atas. Member suspended tidak ikut.
--  · Skor dari game tidak lagi menghasilkan Slay Point langsung (points_awarded selalu 0 mulai sekarang);
--    Slay Point yang sudah diberikan dengan aturan lama tetap di points_ledger.

create table game_month_settled (
  month       date primary key,
  settled_at  timestamptz not null default now()
);
alter table game_month_settled enable row level security;

create table game_month_prizes (
  month       date not null references game_month_settled(month) on delete cascade,
  rank        smallint not null check (rank between 1 and 3),
  member_id   uuid not null references profiles(id) on delete cascade,
  score       integer not null,
  points      integer not null check (points > 0),
  primary key (month, rank),
  unique (month, member_id)
);
-- Tanpa policy: hanya lewat RPC.
alter table game_month_prizes enable row level security;

create index game_scores_created_idx on game_scores (created_at);

/** Awal bulan WIB dari sebuah waktu. */
create function game_month_of(p_at timestamptz)
returns date language sql immutable set search_path = public as $$
  select date_trunc('month', p_at at time zone 'Asia/Jakarta')::date;
$$;

/** Peringkat satu bulan: skor terbaik per member (tanpa suspended), seri → yang lebih dulu. */
create function game_month_ranking(p_month date)
returns table (rk integer, member_id uuid, score integer)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (g.member_id) g.member_id, g.score, g.created_at
    from game_scores g
    where g.game = 'slay_rally' and g.score > 0
      and g.created_at >= (p_month::timestamp at time zone 'Asia/Jakarta')
      and g.created_at < ((p_month + interval '1 month')::timestamp at time zone 'Asia/Jakarta')
    order by g.member_id, g.score desc, g.created_at
  )
  select (row_number() over (order by b.score desc, b.created_at))::integer, b.member_id, b.score
  from best b
  join profiles p on p.id = b.member_id and p.status <> 'suspended';
$$;
revoke execute on function game_month_ranking(date) from public, anon, authenticated;

/** Bayar hadiah 3 besar untuk setiap bulan yang sudah lewat dan belum dibayar. Aman dipanggil berulang. */
create function game_settle_months()
returns void language plpgsql security definer set search_path = public as $$
declare
  c_prizes constant integer[] := array[20, 10, 5];   -- GAME_MONTHLY_PRIZES
  v_current date := game_month_of(now());
  v_month date;
  v_row record;
begin
  -- Jalan cepat: bulan lalu sudah dibayar (atau belum ada skor sama sekali) → tidak ada yang perlu dikerjakan.
  if exists (select 1 from game_month_settled where month = (v_current - interval '1 month')::date)
     or not exists (select 1 from game_scores where created_at < (v_current::timestamp at time zone 'Asia/Jakarta')) then
    return;
  end if;
  -- Satu pembayar sekaligus; pemanggil lain (mis. leaderboard publik) tidak perlu menunggu.
  if not pg_try_advisory_xact_lock(hashtext('game_settle_months')) then
    return;
  end if;
  for v_month in
    select gs.m::date
    from generate_series(
      (select game_month_of(min(created_at)) from game_scores),
      (v_current - interval '1 month')::date,
      interval '1 month'
    ) gs(m)
    where not exists (select 1 from game_month_settled s where s.month = gs.m::date)
    order by 1
  loop
    insert into game_month_settled (month) values (v_month);
    for v_row in select * from game_month_ranking(v_month) where rk <= array_length(c_prizes, 1) loop
      insert into game_month_prizes (month, rank, member_id, score, points)
      values (v_month, v_row.rk, v_row.member_id, v_row.score, c_prizes[v_row.rk]);
      insert into points_ledger (member_id, delta, reason, note)
      values (v_row.member_id, c_prizes[v_row.rk], 'bonus', format('Slay Rally · juara %s · %s', v_row.rk, to_char(v_month, 'MM/YYYY')));
    end loop;
  end loop;
end;
$$;
revoke execute on function game_settle_months() from public, anon, authenticated;

-- Kirim skor: validasi sama seperti sebelumnya, tanpa konversi ke Slay Point. Mengembalikan skor
-- terbaik & peringkat member di leaderboard bulan ini.
create or replace function submit_game_score(p_session uuid, p_score integer, p_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := auth.uid();
  v_session game_sessions%rowtype;
  v_secs numeric;
  v_month date := game_month_of(now());
  v_rank integer;
  v_best integer;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  if p_score is null or p_level is null or p_score < 0 or p_level < 1 then
    raise exception 'invalid_score';
  end if;
  perform game_settle_months();
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
  insert into game_scores (member_id, session_id, score, level, duration_ms, points_awarded)
  values (v_member, v_session.id, p_score, p_level, (v_secs * 1000)::integer, 0);

  select r.rk, r.score into v_rank, v_best from game_month_ranking(v_month) r where r.member_id = v_member;

  return jsonb_build_object('best', coalesce(v_best, p_score), 'rank', v_rank);
end;
$$;

-- Leaderboard bulan berjalan: top N + baris pemanggil bila di luar top N. Membayar bulan lalu dulu bila perlu.
drop function game_leaderboard(integer);
create function game_leaderboard(p_limit integer default 10)
returns table (rank integer, name text, best integer, is_me boolean)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform game_settle_months();
  return query
    select r.rk,
           coalesce(nullif(trim(p.display_name), ''), split_part(trim(p.full_name), ' ', 1)),
           r.score,
           coalesce(r.member_id = auth.uid(), false)
    from game_month_ranking(game_month_of(now())) r
    join profiles p on p.id = r.member_id
    where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 50) or r.member_id = auth.uid()
    order by r.rk;
end;
$$;
revoke execute on function game_leaderboard(integer) from public;
grant execute on function game_leaderboard(integer) to anon, authenticated;

