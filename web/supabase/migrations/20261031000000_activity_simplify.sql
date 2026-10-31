-- Activities — versi simplify (Figma "Simplify Page" 1248:4110): host yang tidak ikut main
-- menjalankan sesi dari member web — Mulai Activity, atur / acak ulang line-up, Akhiri Activity —
-- dan peserta memberi review setelah sesi selesai. Diputuskan 30 Okt: admin & host sama-sama
-- bisa menutup sesi; skor hanya diinput host.

-- Siapa yang mengakhiri sesi (tampil "Diakhiri oleh kamu (host)").
alter table sessions add column ended_by uuid references auth.users(id) on delete set null;

/**
 * Mulai Activity (S1-H): sesi jadi live sebelum / tepat jam jadwal, Ronde 1 (atau ronde
 * terkecil di line-up) langsung live. Host boleh memulai sejak check-in dibuka (30 menit
 * sebelum jadwal); admin bebas. Tanpa ditekan, sesi tetap live otomatis di jam jadwal.
 */
create function start_session_activity(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_first smallint;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not has_permission('activities', 'edit') and v_s.starts_at - interval '30 minutes' > now() then
    raise exception 'Activity baru bisa dimulai 30 menit sebelum jadwal';
  end if;
  select min(round_no) into v_first from session_matches where session_id = p_session;
  update sessions
  set live_started_at = coalesce(live_started_at, now()),
      current_round = coalesce(current_round, v_first),
      started_rounds = case when v_first is null or current_round is not null then started_rounds
                            else (select array_agg(distinct r order by r) from unnest(started_rounds || v_first) r) end
  where id = p_session;
end $$;
revoke execute on function start_session_activity(uuid) from anon;

/**
 * Line-up dari Panel Host (Atur line-up / Acak ulang · prioritaskan yang hadir): ganti semua
 * match TANPA skor mulai ronde `p_from_round` dengan `p_matches`
 * ([{round_no, court_no, a1, a2, b1, b2}], id = session_participants.id). Court yang sudah berskor
 * tidak tersentuh; pemain tidak boleh dobel dalam satu ronde.
 */
create function host_save_lineup(p_session uuid, p_from_round smallint, p_matches jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_bad text;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri — line-up terkunci'; end if;

  if exists (select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid) where round_no < p_from_round or round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Ronde / court di luar format sesi';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid), unnest(array[l.a1, l.a2, l.b1, l.b2]) p(id)
    where not exists (select 1 from session_participants sp where sp.id = p.id and sp.session_id = p_session)
  ) then raise exception 'Ada pemain yang bukan peserta sesi ini'; end if;

  delete from session_matches where session_id = p_session and round_no >= p_from_round and score_a is null;
  insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2)
  select p_session, l.round_no, l.court_no, l.a1, l.a2, l.b1, l.b2
  from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid)
  where not exists (select 1 from session_matches m where m.session_id = p_session and m.round_no = l.round_no and m.court_no = l.court_no);

  select format('Ronde %s', round_no) into v_bad
  from session_matches m, unnest(array[m.a1, m.a2, m.b1, m.b2]) p(id)
  where m.session_id = p_session
  group by round_no, p.id having count(*) > 1 limit 1;
  if v_bad is not null then raise exception 'Ada pemain yang main dua kali di %', v_bad; end if;
end $$;
revoke execute on function host_save_lineup(uuid, smallint, jsonb) from anon;

/**
 * Akhiri Activity (HL-5a): sesi selesai & skor terkunci. Match tanpa skor & ronde yang belum
 * dimulai tidak masuk hasil. Peringkat final (sama dengan leaderboard: poin lalu menang, atau
 * menang lalu poin) → bonus juara +100 / +75 / +50 Slay Point untuk member di peringkat 1–3
 * (nilai sama berbagi peringkat). Host hanya bisa mengakhiri sesi yang sudah berjalan.
 */
create function end_session_activity(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
begin
  select * into v_s from sessions where id = p_session for update;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not has_permission('activities', 'edit') and v_s.live_started_at is null and v_s.starts_at > now() then
    raise exception 'Sesi belum dimulai';
  end if;

  update sessions set ended_at = now(), ended_by = auth.uid(), status = 'completed' where id = p_session;

  insert into points_ledger (member_id, delta, reason, booking_id, note)
  select sp.member_id,
         case r.rk when 1 then 100 when 2 then 75 else 50 end,
         'bonus',
         (select b.id from bookings b where b.session_id = p_session and b.member_id = sp.member_id limit 1),
         format('Bonus juara #%s · %s', r.rk, v_s.title)
  from (
    select pid, rank() over (order by
             case when v_s.leaderboard_mode = 'wins' then wins else pts end desc,
             case when v_s.leaderboard_mode = 'wins' then pts else wins end desc) as rk
    from (
      select pid, sum(own) as pts, count(*) filter (where own > opp) as wins
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
  where r.rk <= 3 and sp.member_id is not null;
end $$;
revoke execute on function end_session_activity(uuid) from anon;

-- Review sesi oleh peserta (S3-P · tab Review): +10 Slay Point sekali, bisa diubah 7 hari.
create table session_reviews (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  member_id    uuid not null references profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  highlights   text[] not null default '{}',
  host_rating  smallint check (host_rating between 1 and 5),
  venue_rating smallint check (venue_rating between 1 and 5),
  format_rating smallint check (format_rating between 1 and 5),
  comment      text check (char_length(comment) <= 500),
  testimonial  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, member_id)
);
alter table session_reviews enable row level security;
create policy "member read own reviews" on session_reviews for select using (member_id = auth.uid());
create policy "admin read reviews" on session_reviews for select using (has_permission('activities', 'view'));

/** Kirim / ubah review: hanya peserta sesi yang sudah selesai, sampai 7 hari setelah sesi. */
create function submit_session_review(
  p_session uuid, p_rating smallint, p_highlights text[], p_host smallint, p_venue smallint, p_format smallint,
  p_comment text, p_testimonial boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_end timestamptz;
  v_booking uuid;
  v_new boolean;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  v_end := coalesce(v_s.ended_at, v_s.ends_at);
  if v_s.ended_at is null and v_s.status <> 'completed' and v_s.ends_at > now() then raise exception 'Review dibuka setelah sesi selesai'; end if;
  if now() > v_end + interval '7 days' then raise exception 'Review sudah terkunci (lewat 7 hari)'; end if;
  if not exists (select 1 from session_participants where session_id = p_session and member_id = auth.uid())
     and not exists (select 1 from bookings where session_id = p_session and member_id = auth.uid() and status in ('registered', 'attended')) then
    raise exception 'Hanya peserta sesi ini yang bisa memberi review';
  end if;

  v_new := not exists (select 1 from session_reviews where session_id = p_session and member_id = auth.uid());
  insert into session_reviews (session_id, member_id, rating, highlights, host_rating, venue_rating, format_rating, comment, testimonial)
  values (p_session, auth.uid(), p_rating, coalesce(p_highlights, '{}'), p_host, p_venue, p_format, nullif(trim(p_comment), ''), coalesce(p_testimonial, false))
  on conflict (session_id, member_id) do update
  set rating = excluded.rating, highlights = excluded.highlights, host_rating = excluded.host_rating,
      venue_rating = excluded.venue_rating, format_rating = excluded.format_rating, comment = excluded.comment,
      testimonial = excluded.testimonial, updated_at = now();

  if v_new then
    select id into v_booking from bookings where session_id = p_session and member_id = auth.uid() limit 1;
    insert into points_ledger (member_id, delta, reason, booking_id, note)
    values (auth.uid(), 10, 'bonus', v_booking, format('Review sesi · %s', v_s.title));
  end if;
end $$;
revoke execute on function submit_session_review(uuid, smallint, text[], smallint, smallint, smallint, text, boolean) from anon;
