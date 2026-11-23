-- Penilaian level pemain oleh host (beta, 23 Nov 2026) — mirip "Player Skill Assessments" Reclub, skala NTRP.
--
-- · Skala: 1.0 Newbie … 6.0+ Pro, langkah 0.5 (nama & deskripsi di web/src/lib/player-level.ts).
--   ntrp null = "Tidak tahu": tercatat sudah dijawab, tapi tidak ikut rata-rata.
-- · Yang dinilai: member yang hadir di activity selesai yang di-host (session_hosts role 'host', co-host
--   juga) — antrean default 90 hari terakhir, diurutkan dari yang paling sering main bersama host itu.
-- · Satu nilai aktif per host–pemain (simpan ulang = ganti). Host tidak bisa menilai dirinya sendiri.
-- · Level gabungan = rata-rata nilai semua host (bukan jumlah). Pemain TIDAK bisa membaca levelnya: tabel
--   tanpa policy member; host hanya membaca nilainya sendiri lewat RPC; admin Members membaca semua.
-- · Line-up: session_player_levels → bobot level untuk acak Rotating Partner (host & admin).

create table player_ratings (
  host_id   uuid not null references profiles(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  ntrp      numeric(2,1) check (ntrp is null or (ntrp between 1.0 and 6.0 and ntrp * 2 = trunc(ntrp * 2))),
  rated_at  timestamptz not null default now(),
  primary key (host_id, member_id),
  check (host_id <> member_id)
);
create index player_ratings_member_idx on player_ratings (member_id);

alter table player_ratings enable row level security;
create policy "admin read player ratings" on player_ratings for select using (has_permission('members', 'view'));
revoke insert, update, delete on player_ratings from anon, authenticated;

/** Hadir di sesi ini: booking 'attended' atau baris peserta (impor Kuyy) yang sudah check-in. */
create function session_attendee_ids(p_session uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.member_id from bookings b where b.session_id = p_session and b.status = 'attended'
  union
  select p.member_id from session_participants p where p.session_id = p_session and p.member_id is not null and p.checked_in_at is not null;
$$;
revoke execute on function session_attendee_ids(uuid) from public, anon, authenticated;

/** Activity yang sudah selesai (diakhiri / lewat jam tutup) dan di-host `p_host`. */
create function hosted_finished_sessions(p_host uuid) returns setof sessions
language sql stable security definer set search_path = public as $$
  select s.* from sessions s
  join session_hosts h on h.session_id = s.id and h.member_id = p_host and h.role = 'host'
  where s.status in ('published', 'completed')
    and (session_is_finished(s) or session_closes_at(s.ends_at) <= now());
$$;
revoke execute on function hosted_finished_sessions(uuid) from public, anon, authenticated;

/**
 * Antrean penilaian host yang login. `p_session` diisi → hanya peserta hadir activity itu (prompt setelah
 * Akhiri Activity). Tanpa `p_session` → main bareng 90 hari terakhir + semua yang pernah ia nilai.
 * Per pemain: jumlah main bareng (90 hari), activity terakhir, co-host, nilai saya, dan `due`
 * (belum dinilai, atau nilai > 90 hari dan sejak itu main bareng lagi).
 */
create function host_rating_queue(p_session uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then return '[]'::jsonb; end if;
  if p_session is not null and not exists (select 1 from hosted_finished_sessions(v_me) s where s.id = p_session) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    with hosted as (
      select s.id, s.title, s.starts_at, s.venue_id from hosted_finished_sessions(v_me) s
      where (p_session is null and s.starts_at >= now() - interval '90 days') or s.id = p_session
    ),
    played as (
      select a.member_id, h.id as session_id, h.title, h.starts_at, h.venue_id
      from hosted h cross join lateral session_attendee_ids(h.id) a(member_id)
      where a.member_id <> v_me
    ),
    pool as (
      select member_id from played
      union
      select member_id from player_ratings where host_id = v_me and p_session is null
    ),
    items as (
      select
        p.member_id,
        (select count(distinct x.session_id) from played x where x.member_id = p.member_id) as times,
        last.session_id as last_session, last.title as last_title, last.starts_at as last_at, last.venue_id,
        r.ntrp, r.rated_at, r.host_id is not null as rated
      from pool p
      left join lateral (select * from played x where x.member_id = p.member_id order by x.starts_at desc limit 1) last on true
      left join player_ratings r on r.host_id = v_me and r.member_id = p.member_id
    )
    select jsonb_agg(jsonb_build_object(
             'member_id', x.member_id, 'name', pr.full_name, 'avatar', pr.avatar_path,
             'times', x.times, 'last_title', x.last_title, 'last_at', x.last_at, 'venue', v.name,
             'cohosts', coalesce((
               select jsonb_agg(cp.full_name order by cp.full_name) from session_hosts ch join profiles cp on cp.id = ch.member_id
               where ch.session_id = x.last_session and ch.role = 'host' and ch.member_id <> v_me), '[]'::jsonb),
             'ntrp', x.ntrp, 'rated', x.rated, 'rated_at', x.rated_at,
             'due', not x.rated or (x.rated_at < now() - interval '90 days' and x.last_at > x.rated_at))
           order by (not x.rated or (x.rated_at < now() - interval '90 days' and x.last_at > x.rated_at)) desc,
                    x.times desc, x.last_at desc nulls last, pr.full_name)
    from items x
    join profiles pr on pr.id = x.member_id
    left join venues v on v.id = x.venue_id
  ), '[]'::jsonb);
end $$;
revoke execute on function host_rating_queue(uuid) from public, anon;
grant execute on function host_rating_queue(uuid) to authenticated;

/** Simpan / ganti nilai saya untuk satu pemain (null = Tidak tahu). Pemain harus pernah hadir di activity saya. */
create function rate_player(p_member uuid, p_ntrp numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Masuk dulu' using errcode = '42501'; end if;
  if p_member = v_me then raise exception 'Tidak bisa menilai diri sendiri' using errcode = '22023'; end if;
  if p_ntrp is not null and (p_ntrp < 1.0 or p_ntrp > 6.0 or p_ntrp * 2 <> trunc(p_ntrp * 2)) then
    raise exception 'Level tidak valid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from hosted_finished_sessions(v_me) s where exists (select 1 from session_attendee_ids(s.id) a where a = p_member)
  ) then
    raise exception 'Hanya pemain dari activity yang kamu host' using errcode = '42501';
  end if;
  insert into player_ratings (host_id, member_id, ntrp, rated_at) values (v_me, p_member, p_ntrp, now())
  on conflict (host_id, member_id) do update set ntrp = excluded.ntrp, rated_at = excluded.rated_at;
end $$;
revoke execute on function rate_player(uuid, numeric) from public, anon;
grant execute on function rate_player(uuid, numeric) to authenticated;

/**
 * Level gabungan (rata-rata nilai host, tanpa "Tidak tahu") peserta member sebuah activity — untuk acak line-up.
 * Hanya host yang ditunjuk & admin Activities; selain itu kosong (pemain tidak pernah melihat levelnya).
 */
create function session_player_levels(p_session uuid)
returns table (member_id uuid, ntrp numeric, raters integer)
language sql stable security definer set search_path = public as $$
  select r.member_id, round(avg(r.ntrp), 2), count(*)::int
  from player_ratings r
  where r.ntrp is not null
    and r.member_id in (
      select p.member_id from session_participants p where p.session_id = p_session and p.member_id is not null
      union
      select b.member_id from bookings b where b.session_id = p_session and b.status <> 'cancelled')
    and (select is_assigned_host(p_session) or has_permission('activities'))
  group by r.member_id;
$$;
revoke execute on function session_player_levels(uuid) from public, anon;
grant execute on function session_player_levels(uuid) to authenticated;
