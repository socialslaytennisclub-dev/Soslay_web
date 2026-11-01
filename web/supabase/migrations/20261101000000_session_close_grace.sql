-- Jeda tutup sesi 30 menit (diminta 1 Nov): sesi tidak langsung ditutup tepat di jam selesai.
-- Selama jeda host masih bisa Mulai Ronde, input skor & check-in, member masih bisa check-in
-- mandiri. Setelah jeda sesi DITUTUP SUNGGUHAN (status completed + bonus juara) oleh
-- close_expired_sessions() — dijalankan pg_cron tiap 5 menit dan dipanggil aplikasi saat membaca
-- sesi yang sudah lewat jeda. "Akhiri Activity" tetap menutup sesi saat itu juga.
-- Durasi jeda sama dengan web/src/lib/session-close.ts (dicek di scripts/check-migrations.mjs).

create function session_closes_at(p_ends_at timestamptz)
returns timestamptz language sql immutable as $$
  select p_ends_at + interval '30 minutes'
$$;

-- Hak menjalankan sesi (skor, line-up, check-in host, Mulai Ronde, Akhiri): admin selalu; host
-- hanya sampai sesi ditutup. Dipakai semua RPC tulis host — bukan policy baca.
create or replace function can_run_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission('activities', 'edit')
      or (is_session_host(p_session)
          and exists (select 1 from sessions s where s.id = p_session and session_closes_at(s.ends_at) >= now()));
$$;

/**
 * Tutup sesi: status completed, waktu & penutupnya dicatat, lalu bonus juara 1–3 (sekali per
 * member, peringkat terbaiknya). Internal — dipanggil end_session_activity & close_expired_sessions.
 */
create function finish_session(p_session uuid, p_by uuid, p_at timestamptz)
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
  where r.rk <= 3 and sp.member_id is not null
  order by sp.member_id, r.rk;
end $$;
revoke execute on function finish_session(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function end_session_activity(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
begin
  select * into v_s from sessions where id = p_session for update;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if not has_permission('activities', 'edit') and v_s.live_started_at is null and v_s.starts_at > now() then
    raise exception 'Sesi belum dimulai';
  end if;
  perform finish_session(p_session, auth.uid(), now());
end $$;

/**
 * Tutup otomatis semua sesi published yang sudah lewat jeda (ended_at = waktu tutupnya, penutup
 * kosong = sistem). Idempoten & aman dipanggil bersamaan (skip locked). Mengembalikan jumlah sesi.
 */
create function close_expired_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s record;
  v_count integer := 0;
begin
  for v_s in
    select id, ends_at from sessions
    where status = 'published' and ended_at is null and session_closes_at(ends_at) < now()
    for update skip locked
  loop
    perform finish_session(v_s.id, null, session_closes_at(v_s.ends_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function close_expired_sessions() from public, anon;
grant execute on function close_expired_sessions() to authenticated;

-- Jadwal tiap 5 menit bila pg_cron tersedia (Supabase). PGlite / tanpa izin → dilewati; aplikasi
-- tetap memanggil close_expired_sessions() saat membaca sesi yang sudah lewat jeda.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('close-expired-sessions', '*/5 * * * *', 'select public.close_expired_sessions()');
exception when others then
  raise notice 'pg_cron tidak tersedia (%), tutup otomatis hanya lewat aplikasi', sqlerrm;
end $$;

create or replace function start_session_round(p_session uuid, p_round smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_prev smallint;
  v_last smallint;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri'; end if;
  if not has_permission('activities', 'edit') then
    if session_closes_at(v_s.ends_at) < now() then raise exception 'Sesi sudah diakhiri'; end if;
    if v_s.live_started_at is null and v_s.starts_at > now() then raise exception 'Sesi belum dimulai'; end if;
  end if;
  if not exists (select 1 from session_matches where session_id = p_session and round_no = p_round) then
    raise exception 'Ronde % belum ada di line-up', p_round;
  end if;

  v_prev := v_s.current_round;
  if v_prev is null then
    select max(round_no) into v_last from session_matches where session_id = p_session and score_a is not null;
    if v_last is null then
      select min(round_no) into v_prev from session_matches where session_id = p_session;
    elsif exists (select 1 from session_matches where session_id = p_session and round_no = v_last and score_a is null) then
      v_prev := v_last;
    else
      select coalesce(min(round_no), v_last) into v_prev from session_matches
      where session_id = p_session and round_no > v_last and score_a is null;
    end if;
  end if;

  update sessions
  set current_round = p_round,
      started_rounds = (select array_agg(distinct r order by r) from unnest(started_rounds || v_prev || p_round) r where r is not null),
      live_started_at = coalesce(live_started_at, now())
  where id = p_session;
end $$;

create or replace function member_self_check_in(p_session uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s sessions%rowtype;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'Masuk dulu untuk check-in'; end if;
  select * into v_s from sessions where id = p_session;
  if not found or v_s.status in ('draft', 'cancelled') then raise exception 'Sesi tidak ditemukan'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' or now() > session_closes_at(v_s.ends_at) then raise exception 'Sesi sudah selesai'; end if;
  -- Dibuka 30 menit sebelum jadwal — atau sejak sesi di-live-kan lebih awal oleh admin.
  if now() < least(v_s.starts_at - interval '30 minutes', coalesce(v_s.live_started_at, 'infinity')) then
    raise exception 'Check-in dibuka 30 menit sebelum sesi';
  end if;

  -- Baris peserta milik member (booking website tanpa baris peserta dibuatkan); bukan peserta → ditolak.
  perform session_participant_for(p_session, v_uid);
  update session_participants
  set checked_in_at = now(), checked_in_by = v_uid
  where session_id = p_session and member_id = v_uid and checked_in_at is null;

  select min(checked_in_at) into v_at from session_participants where session_id = p_session and member_id = v_uid;
  return v_at;
end $$;

create or replace function submit_session_review(
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
  v_end := coalesce(v_s.ended_at, session_closes_at(v_s.ends_at));
  if v_s.ended_at is null and v_s.status <> 'completed' and session_closes_at(v_s.ends_at) > now() then raise exception 'Review dibuka setelah sesi selesai'; end if;
  if now() > v_end + interval '7 days' then raise exception 'Review sudah terkunci (lewat 7 hari)'; end if;
  if not exists (select 1 from session_participants where session_id = p_session and member_id = auth.uid())
     and not exists (select 1 from bookings where session_id = p_session and member_id = auth.uid() and status in ('registered', 'attended')) then
    raise exception 'Hanya peserta sesi ini yang bisa memberi review';
  end if;

  -- xmax = 0 → baris baru (bukan update): +10 hanya untuk insert pertama, aman dari kiriman bersamaan.
  insert into session_reviews (session_id, member_id, rating, highlights, host_rating, venue_rating, format_rating, comment, testimonial)
  values (p_session, auth.uid(), p_rating, coalesce(p_highlights, '{}'), p_host, p_venue, p_format, nullif(trim(p_comment), ''), coalesce(p_testimonial, false))
  on conflict (session_id, member_id) do update
  set rating = excluded.rating, highlights = excluded.highlights, host_rating = excluded.host_rating,
      venue_rating = excluded.venue_rating, format_rating = excluded.format_rating, comment = excluded.comment,
      testimonial = excluded.testimonial, updated_at = now()
  returning (xmax = 0) into v_new;

  if v_new then
    select id into v_booking from bookings where session_id = p_session and member_id = auth.uid() limit 1;
    insert into points_ledger (member_id, delta, reason, booking_id, note)
    values (auth.uid(), 10, 'bonus', v_booking, format('Review sesi · %s', v_s.title));
  end if;
end $$;
