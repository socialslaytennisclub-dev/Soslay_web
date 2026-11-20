-- Slay Tennis (/gameoncourt), 20 Nov 2026 — Slay Point hanya dari pertandingan member vs member:
--  · Lawan komputer tidak menghasilkan Slay Point (game 1 bebas tanpa akun; game 2 wajib masuk — di klien).
--  · Member vs member: pemenang +1 Slay Point (points_ledger reason 'bonus', note "Slay Tennis · …").
--  · Pertandingan dijalankan di browser kedua pemain (Supabase Realtime), jadi hasilnya tidak bisa
--    dipercaya dari satu pihak. Aturan supaya poin tidak mudah dipalsukan:
--      – host membuka catatan pertandingan, lawan bergabung dengan akunnya sendiri;
--      – KEDUA pemain melaporkan hasil, dan poin hanya diberikan bila laporannya sama
--        (yang kalah ikut mengakui kekalahannya);
--      – pertandingan minimal 30 detik sejak lawan bergabung (menang 2–0 tercepat ±40 detik);
--      – maksimal 5 Slay Point per pemenang per hari WIB, dan 3 per pasangan pemain per hari
--        (dua akun yang sama tidak bisa saling "memberi" poin terus-menerus).
--    Angka poin & batas harian sama dengan web/src/lib/tennis.ts (dicek di check-migrations).

create table tennis_matches (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references profiles(id) on delete cascade,
  guest_id              uuid references profiles(id) on delete cascade,
  joined_at             timestamptz,
  -- Laporan masing-masing pemain: true = host menang.
  host_says_host_won    boolean,
  guest_says_host_won   boolean,
  winner_id             uuid references profiles(id) on delete set null,
  awarded               boolean not null default false,
  -- Kenapa tidak dapat poin: disputed | too_short | daily_cap | pair_cap.
  no_award_reason       text,
  created_at            timestamptz not null default now(),
  finished_at           timestamptz,
  check (guest_id is null or guest_id <> host_id)
);
create index tennis_matches_host_idx on tennis_matches (host_id, created_at desc);
create index tennis_matches_winner_idx on tennis_matches (winner_id, finished_at desc) where awarded;

alter table tennis_matches enable row level security;
create policy "players read own tennis matches" on tennis_matches for select
  using (host_id = auth.uid() or guest_id = auth.uid() or has_permission('members'));

create function tennis_match_open()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := auth.uid();
  v_id uuid;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  -- Room lama yang tidak pernah dimainkan tidak perlu disimpan.
  delete from tennis_matches where host_id = v_member and finished_at is null and created_at < now() - interval '1 day';
  -- Satu pertandingan = satu catatan; 30 per 10 menit jauh di atas main normal, cukup untuk menahan
  -- skrip yang membuka catatan terus-menerus.
  if (select count(*) from tennis_matches where host_id = v_member and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_matches';
  end if;
  insert into tennis_matches (host_id) values (v_member) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function tennis_match_open() from public, anon;
grant execute on function tennis_match_open() to authenticated;

create function tennis_match_join(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := auth.uid();
  v_match tennis_matches%rowtype;
begin
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  select * into v_match from tennis_matches where id = p_match for update;
  if not found or v_match.host_id = v_member or v_match.finished_at is not null
     or v_match.created_at < now() - interval '3 hours' then
    raise exception 'match_unavailable';
  end if;
  if v_match.guest_id is null then
    update tennis_matches set guest_id = v_member, joined_at = now() where id = p_match;
  elsif v_match.guest_id <> v_member then
    raise exception 'match_unavailable';
  end if;
end;
$$;
revoke execute on function tennis_match_join(uuid) from public, anon;
grant execute on function tennis_match_join(uuid) to authenticated;

-- Laporan hasil dari salah satu pemain. Aman dipanggil berulang (mengembalikan status terbaru).
create function tennis_match_report(p_match uuid, p_host_won boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_points constant integer := 1;        -- TENNIS_WIN_POINTS
  c_daily constant integer := 5;         -- TENNIS_DAILY_WIN_CAP
  c_pair constant integer := 3;
  c_min_seconds constant integer := 30;
  v_member uuid := auth.uid();
  v_match tennis_matches%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_reason text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_host_won is null then
    raise exception 'invalid_report';
  end if;
  -- Sama dengan open / join: akun yang di-suspend tidak bisa melapor (dan tidak bisa mendapat poin).
  if not game_member_ok(v_member) then
    raise exception 'not_member';
  end if;
  select * into v_match from tennis_matches where id = p_match for update;
  if not found or v_match.guest_id is null or v_member not in (v_match.host_id, v_match.guest_id) then
    raise exception 'match_unavailable';
  end if;

  -- Laporan pertama tiap pemain yang dipakai.
  if v_member = v_match.host_id and v_match.host_says_host_won is null then
    v_match.host_says_host_won := p_host_won;
  elsif v_member = v_match.guest_id and v_match.guest_says_host_won is null then
    v_match.guest_says_host_won := p_host_won;
  end if;

  if v_match.finished_at is null and v_match.host_says_host_won is not null and v_match.guest_says_host_won is not null then
    v_match.finished_at := now();
    if v_match.host_says_host_won <> v_match.guest_says_host_won then
      v_reason := 'disputed';
    else
      v_winner := case when v_match.host_says_host_won then v_match.host_id else v_match.guest_id end;
      v_loser := case when v_match.host_says_host_won then v_match.guest_id else v_match.host_id end;
      v_match.winner_id := v_winner;
      -- Batas harian dihitung berurutan per pemenang.
      perform pg_advisory_xact_lock(hashtext('tennis_win:' || v_winner::text));
      if v_match.joined_at is null or now() - v_match.joined_at < make_interval(secs => c_min_seconds) then
        v_reason := 'too_short';
      elsif (select count(*) from tennis_matches m
             where m.winner_id = v_winner and m.awarded
               and (m.finished_at at time zone 'Asia/Jakarta')::date = v_today) >= c_daily then
        v_reason := 'daily_cap';
      elsif (select count(*) from tennis_matches m
             where m.awarded and (m.finished_at at time zone 'Asia/Jakarta')::date = v_today
               and least(m.host_id, m.guest_id) = least(v_winner, v_loser)
               and greatest(m.host_id, m.guest_id) = greatest(v_winner, v_loser)) >= c_pair then
        v_reason := 'pair_cap';
      else
        v_match.awarded := true;
        insert into points_ledger (member_id, delta, reason, note)
        values (v_winner, c_points, 'bonus',
                format('Slay Tennis · menang vs %s',
                       (select coalesce(nullif(trim(display_name), ''), split_part(trim(full_name), ' ', 1)) from profiles where id = v_loser)));
      end if;
    end if;
    v_match.no_award_reason := v_reason;
  end if;

  update tennis_matches set
    host_says_host_won = v_match.host_says_host_won,
    guest_says_host_won = v_match.guest_says_host_won,
    winner_id = v_match.winner_id,
    awarded = v_match.awarded,
    no_award_reason = v_match.no_award_reason,
    finished_at = v_match.finished_at
  where id = p_match;

  return jsonb_build_object(
    'pending', v_match.finished_at is null,
    'won', v_match.winner_id is not null and v_match.winner_id = v_member,
    'points', case when v_match.awarded and v_match.winner_id = v_member then c_points else 0 end,
    'reason', v_match.no_award_reason
  );
end;
$$;
revoke execute on function tennis_match_report(uuid, boolean) from public, anon;
grant execute on function tennis_match_report(uuid, boolean) to authenticated;
