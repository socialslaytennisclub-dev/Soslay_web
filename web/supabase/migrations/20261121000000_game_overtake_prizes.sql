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
--  · Skor terbaik tiap member disimpan di game_best (diisi trigger dari game_scores) supaya peringkat
--    cukup dihitung dari satu baris per member lewat indeks, bukan dari seluruh riwayat skor. Skor yang
--    dihapus / dikoreksi (mis. skor curang) ikut memperbarui game_best.
--  · Seri persis (skor & waktu sama): member_id sebagai pemecah terakhir, sama di peringkat & leaderboard.

-- Skor yang tersimpan selama migrasi tidak terlewat di antara isi awal game_best dan trigger-nya.
lock table game_scores in share row exclusive mode;

create table game_best (
  member_id   uuid primary key references profiles(id) on delete cascade,
  score       integer not null check (score > 0),
  -- Kapan skor terbaik ini PERTAMA dicapai (penentu urutan seri).
  reached_at  timestamptz not null
);
create index game_best_rank_idx on game_best (score desc, reached_at, member_id);
-- Tanpa policy: hanya lewat RPC.
alter table game_best enable row level security;

insert into game_best (member_id, score, reached_at)
select distinct on (member_id) member_id, score, created_at
from game_scores
where game = 'slay_rally' and score > 0
order by member_id, score desc, created_at;

create function game_best_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.game = 'slay_rally' and new.score > 0 then
    insert into game_best (member_id, score, reached_at)
    values (new.member_id, new.score, new.created_at)
    on conflict (member_id) do update
      set score = excluded.score, reached_at = excluded.reached_at
      where excluded.score > game_best.score;
  end if;
  return new;
end;
$$;
create trigger game_scores_best after insert on game_scores for each row execute function game_best_track();

-- Skor dihapus / dikoreksi → skor terbaik member itu dihitung ulang dari riwayatnya (tanpa skor lagi →
-- keluar dari leaderboard). Hadiah yang sudah dibayar tidak ditarik.
create function game_best_refresh(p_member uuid)
returns void language sql security definer set search_path = public as $$
  delete from game_best where member_id = p_member;
  insert into game_best (member_id, score, reached_at)
  select member_id, score, created_at
  from game_scores
  where member_id = p_member and game = 'slay_rally' and score > 0
  order by score desc, created_at
  limit 1;
$$;
revoke execute on function game_best_refresh(uuid) from public, anon, authenticated;

create function game_best_resync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform game_best_refresh(old.member_id);
  if tg_op = 'UPDATE' and new.member_id <> old.member_id then
    perform game_best_refresh(new.member_id);
  end if;
  return null;
end;
$$;
create trigger game_scores_best_resync after delete or update of member_id, game, score, created_at on game_scores
  for each row execute function game_best_resync();

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

/**
 * Peringkat (1 = teratas) dari skor terbaik `p_score` yang dicapai pada `p_at`, urutan sama dengan
 * game_leaderboard (skor turun, lalu reached_at, lalu member_id). Skor 0 = di bawah semua pemain.
 */
create function game_rank_of(p_member uuid, p_score integer, p_at timestamptz)
returns integer language sql stable security definer set search_path = public as $$
  select 1 + count(*)::integer
  from game_best b
  join profiles p on p.id = b.member_id and p.status <> 'suspended'
  where b.member_id <> p_member
    and (b.score > p_score or (b.score = p_score and (b.reached_at, b.member_id) < (p_at, p_member)));
$$;
revoke execute on function game_rank_of(uuid, integer, timestamptz) from public, anon, authenticated;

-- Kirim skor: validasi sama seperti sebelumnya, tanpa konversi poin. Bila skor ini membuat member
-- menyalip ke 3 besar, hadiah peringkat itu dibayar (sekali per peringkat).
create or replace function submit_game_score(p_session uuid, p_score integer, p_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_prizes constant integer[] := array[20, 10, 5];   -- GAME_RANK_PRIZES
  v_member uuid := auth.uid();
  v_session game_sessions%rowtype;
  v_secs numeric;
  v_old_best game_best%rowtype;
  v_new_best game_best%rowtype;
  v_old integer;
  v_rank integer;
  v_prize integer := 0;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  if p_score is null or p_level is null or p_score < 0 or p_level < 1 then
    raise exception 'invalid_score';
  end if;

  -- Kunci baris sesi: satu sesi tidak bisa dikirim dua kali bersamaan.
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

  select * into v_old_best from game_best where member_id = v_member;
  -- Hanya skor terbaik baru yang bisa menyalip; peringkat saling bergantung antar member → skor seperti itu
  -- dikirim berurutan (skor biasa tidak perlu menunggu kunci ini).
  if p_score > coalesce(v_old_best.score, 0) then
    perform pg_advisory_xact_lock(hashtext('game_scores:board'));
    -- Dibaca ulang setelah kunci: kiriman lain member ini bisa baru saja selesai.
    select * into v_old_best from game_best where member_id = v_member;
    -- Peringkat lama; belum pernah masuk leaderboard → skor 0 = di bawah semua pemain.
    v_old := game_rank_of(v_member, coalesce(v_old_best.score, 0), coalesce(v_old_best.reached_at, now()));
  end if;

  update game_sessions set submitted_at = now() where id = v_session.id;
  -- game_scores.points_awarded (aturan lama 100 : 1) dibiarkan default 0 — baris lama tetap sebagai riwayat.
  insert into game_scores (member_id, session_id, score, level, duration_ms)
  values (v_member, v_session.id, p_score, p_level, (v_secs * 1000)::integer);

  select * into v_new_best from game_best where member_id = v_member;
  v_rank := case when v_new_best.member_id is not null then game_rank_of(v_member, v_new_best.score, v_new_best.reached_at) end;

  -- Menyalip = naik melewati posisi yang tadinya ditempati member lain.
  if v_old is not null and v_rank <= array_length(c_prizes, 1) and v_rank < v_old then
    insert into game_rank_prizes (member_id, rank, score, points)
    values (v_member, v_rank, v_new_best.score, c_prizes[v_rank])
    on conflict do nothing;
    if found then
      v_prize := c_prizes[v_rank];
      insert into points_ledger (member_id, delta, reason, note)
      values (v_member, v_prize, 'bonus', format('Slay Rally · naik ke #%s', v_rank));
    end if;
  end if;

  return jsonb_build_object(
    'best', coalesce(v_new_best.score, p_score),
    'rank', v_rank,
    'prize', v_prize,
    -- Peringkat yang hadiahnya sudah pernah diterima member ini (untuk pesan di game).
    'claimed', coalesce((select jsonb_agg(rank order by rank) from game_rank_prizes where member_id = v_member), '[]'::jsonb)
  );
end;
$$;

-- Leaderboard sepanjang masa: top N + baris pemanggil bila di luar top N (satu baris per member).
create or replace function game_leaderboard(p_limit integer default 10)
returns table (rank integer, name text, best integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select b.member_id, b.score,
           coalesce(nullif(trim(p.display_name), ''), split_part(trim(p.full_name), ' ', 1)) as name,
           (row_number() over (order by b.score desc, b.reached_at, b.member_id))::integer as rk
    from game_best b
    join profiles p on p.id = b.member_id and p.status <> 'suspended'
  )
  select r.rk, r.name, r.score, coalesce(r.member_id = auth.uid(), false)
  from ranked r
  where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 50) or r.member_id = auth.uid()
  order by r.rk;
$$;
