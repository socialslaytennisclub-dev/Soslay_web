-- Perbaikan Panel Host (review 31 Okt):
-- · Member yang daftar lewat website (booking tanpa baris peserta, id roster = member_id) kini bisa
--   di-check-in host & masuk line-up — baris pesertanya dibuat saat pertama dibutuhkan.
-- · Bonus juara sekali per member (member dengan dua baris peserta tidak dapat dua bonus).
-- · +10 review benar-benar sekali walau dikirim bersamaan (dua tab / tap ganda).

alter table session_participants drop constraint session_participants_source_check;
alter table session_participants add constraint session_participants_source_check check (source in ('kuy', 'admin', 'website'));

/**
 * Id baris peserta untuk id roster `p_id`: id baris peserta itu sendiri, atau member_id dari booking
 * website tanpa baris peserta → baris peserta dibuat (status hadir ikut booking). Selain itu ditolak.
 * Hanya dipanggil dari RPC host di bawah (hak host dicek di sana).
 */
create function session_participant_for(p_session uuid, p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from session_participants
  where session_id = p_session and (id = p_id or member_id = p_id)
  order by (id = p_id) desc, imported_at
  limit 1;
  if v_id is not null then return v_id; end if;

  insert into session_participants (session_id, member_id, full_name, tennis_level, source, amount, checked_in_at)
  select p_session, b.member_id, coalesce(pr.full_name, 'Member'), pr.tennis_level, 'website', b.amount,
         case when b.status = 'attended' then coalesce(b.checked_in_at, now()) end
  from bookings b
  join profiles pr on pr.id = b.member_id
  where b.session_id = p_session and b.member_id = p_id and b.status <> 'cancelled'
  returning id into v_id;
  if v_id is null then raise exception 'Ada pemain yang bukan peserta sesi ini'; end if;
  return v_id;
end $$;
revoke execute on function session_participant_for(uuid, uuid) from anon, authenticated;

/** Check-in dari tab Peserta (host / admin) untuk id roster mana pun — booking ikut hadir (+poin). */
create function host_set_check_in(p_session uuid, p_id uuid, p_checked_in boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  perform set_participant_check_in(session_participant_for(p_session, p_id), p_checked_in);
end $$;
revoke execute on function host_set_check_in(uuid, uuid, boolean) from anon;

create or replace function host_save_lineup(p_session uuid, p_from_round smallint, p_matches jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_matches jsonb;
  v_bad text;
begin
  select * into v_s from sessions where id = p_session;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  if not can_run_session(p_session) then raise exception 'Hanya admin atau host sesi ini'; end if;
  if v_s.ended_at is not null or v_s.status = 'completed' then raise exception 'Sesi sudah diakhiri — line-up terkunci'; end if;

  if exists (select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint) where round_no < p_from_round or round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Ronde / court di luar format sesi';
  end if;
  -- Id roster → id baris peserta (booking website dibuatkan baris peserta; bukan peserta ditolak).
  select coalesce(jsonb_agg(jsonb_build_object(
           'round_no', l.round_no, 'court_no', l.court_no,
           'a1', session_participant_for(p_session, l.a1), 'a2', session_participant_for(p_session, l.a2),
           'b1', session_participant_for(p_session, l.b1), 'b2', session_participant_for(p_session, l.b2))), '[]')
  into v_matches
  from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid);

  delete from session_matches where session_id = p_session and round_no >= p_from_round and score_a is null;
  insert into session_matches (session_id, round_no, court_no, a1, a2, b1, b2)
  select p_session, l.round_no, l.court_no, l.a1, l.a2, l.b1, l.b2
  from jsonb_to_recordset(v_matches) as l(round_no smallint, court_no smallint, a1 uuid, a2 uuid, b1 uuid, b2 uuid)
  where not exists (select 1 from session_matches m where m.session_id = p_session and m.round_no = l.round_no and m.court_no = l.court_no);

  select format('Ronde %s', round_no) into v_bad
  from session_matches m, unnest(array[m.a1, m.a2, m.b1, m.b2]) p(id)
  where m.session_id = p_session
  group by round_no, p.id having count(*) > 1 limit 1;
  if v_bad is not null then raise exception 'Ada pemain yang main dua kali di %', v_bad; end if;
end $$;

create or replace function end_session_activity(p_session uuid)
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

  -- Satu bonus per member (peringkat terbaiknya) walau ia punya lebih dari satu baris peserta.
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
  v_end := coalesce(v_s.ended_at, v_s.ends_at);
  if v_s.ended_at is null and v_s.status <> 'completed' and v_s.ends_at > now() then raise exception 'Review dibuka setelah sesi selesai'; end if;
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
