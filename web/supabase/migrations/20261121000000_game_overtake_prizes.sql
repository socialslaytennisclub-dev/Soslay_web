-- Slay Rally: Slay Point dari MENYALIP ke 3 besar leaderboard (21 Nov 2026), menggantikan konversi
-- 100 poin game = 1 Slay Point (maks 10/hari).
--  · Leaderboard permanen (sepanjang masa): skor terbaik tiap member, tanpa reset.
--  · Saat skor yang dikirim membuat member NAIK ke peringkat 1, 2 atau 3 dengan menyalip member lain,
--    ia mendapat 20 / 10 / 5 Slay Point (GAME_RANK_PRIZES di web/src/lib/game.ts — ubah keduanya
--    bersamaan, dicek di check-migrations). Dicatat di points_ledger reason 'bonus', note
--    "Slay Rally · naik ke #N".
--  · Hadiah tiap peringkat hanya sekali per member (maks 20 + 10 + 5 = 35 Slay Point per member),
--    supaya dua pemain tidak bisa saling salip terus untuk mengumpulkan poin.
--  · Masuk ke posisi yang masih kosong (mis. pemain pertama di leaderboard) bukan menyalip → tanpa hadiah.
--  · Tersalip / turun peringkat tidak mengurangi Slay Point. Urutan seri: skor sama → yang lebih dulu
--    mencapainya di atas. Member suspended tidak ikut.
--  · Slay Point yang sudah diberikan dengan aturan lama tetap di points_ledger.

create table game_rank_prizes (
  member_id   uuid not null references profiles(id) on delete cascade,
  rank        smallint not null check (rank between 1 and 3),
  score       integer not null,
  points      integer not null check (points > 0),
  created_at  timestamptz not null default now(),
  primary key (member_id, rank)
);
-- Tanpa policy: hanya lewat RPC.
alter table game_rank_prizes enable row level security;

/** Peringkat sepanjang masa: skor terbaik per member (tanpa suspended), seri → yang lebih dulu. */
create function game_ranking()
returns table (rk integer, member_id uuid, score integer)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (g.member_id) g.member_id, g.score, g.created_at
    from game_scores g
    where g.game = 'slay_rally' and g.score > 0
    order by g.member_id, g.score desc, g.created_at
  )
  select (row_number() over (order by b.score desc, b.created_at))::integer, b.member_id, b.score
  from best b
  join profiles p on p.id = b.member_id and p.status <> 'suspended';
$$;
revoke execute on function game_ranking() from public, anon, authenticated;

-- Kirim skor: validasi sama seperti sebelumnya, tanpa konversi poin. Bila skor ini membuat member
-- menyalip ke 3 besar, hadiah peringkat itu dibayar (sekali per peringkat).
create or replace function submit_game_score(p_session uuid, p_score integer, p_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_prizes constant integer[] := array[20, 10, 5];   -- GAME_RANK_PRIZES
  v_member uuid := auth.uid();
  v_session game_sessions%rowtype;
  v_secs numeric;
  v_before integer;
  v_old integer;
  v_rank integer;
  v_best integer;
  v_prize integer := 0;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  if p_score is null or p_level is null or p_score < 0 or p_level < 1 then
    raise exception 'invalid_score';
  end if;
  -- Peringkat saling bergantung antar member → skor dikirim berurutan (satu leaderboard bersama).
  perform pg_advisory_xact_lock(hashtext('game_scores:board'));

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

  -- Peringkat sebelum skor ini: milik sendiri (null = belum di leaderboard) & jumlah pemain.
  select count(*)::integer, max(r.rk) filter (where r.member_id = v_member)
  into v_before, v_old
  from game_ranking() r;

  update game_sessions set submitted_at = now() where id = v_session.id;
  insert into game_scores (member_id, session_id, score, level, duration_ms, points_awarded)
  values (v_member, v_session.id, p_score, p_level, (v_secs * 1000)::integer, 0);

  select r.rk, r.score into v_rank, v_best from game_ranking() r where r.member_id = v_member;

  -- Menyalip = naik melewati posisi yang tadinya ditempati member lain.
  if v_rank is not null and v_rank <= array_length(c_prizes, 1) and v_rank < coalesce(v_old, v_before + 1) then
    insert into game_rank_prizes (member_id, rank, score, points)
    values (v_member, v_rank, v_best, c_prizes[v_rank])
    on conflict do nothing;
    if found then
      v_prize := c_prizes[v_rank];
      insert into points_ledger (member_id, delta, reason, note)
      values (v_member, v_prize, 'bonus', format('Slay Rally · naik ke #%s', v_rank));
    end if;
  end if;

  return jsonb_build_object('best', coalesce(v_best, p_score), 'rank', v_rank, 'previous_rank', v_old, 'prize', v_prize);
end;
$$;

-- Leaderboard sepanjang masa: top N + baris pemanggil bila di luar top N.
create or replace function game_leaderboard(p_limit integer default 10)
returns table (rank integer, name text, best integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  select r.rk,
         coalesce(nullif(trim(p.display_name), ''), split_part(trim(p.full_name), ' ', 1)),
         r.score,
         coalesce(r.member_id = auth.uid(), false)
  from game_ranking() r
  join profiles p on p.id = r.member_id
  where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 50) or r.member_id = auth.uid()
  order by r.rk;
$$;
