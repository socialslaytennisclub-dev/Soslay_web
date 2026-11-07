-- Perbaikan code review 20261107020000 & 20261107030000.

-- 1. Nama peserta diubah → keterangan transaksi Keuangan otomatisnya ikut. Dulu yang dicocokkan hanya
--    akhiran sepanjang nama lama: nama lama kosong selalu cocok (nama baru ditempel di ujung), dan nama
--    yang menjadi akhiran kata lain ikut terganti ("· Rihana" + nama lama "Ana" → "· RihDina").
--    Sekarang yang dicocokkan " · <nama lama>" utuh di akhir keterangan.
create or replace function finance_on_participant_renamed() returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_tail text := ' · ' || old.full_name;
begin
  if coalesce(old.full_name, '') = '' then return null; end if;
  update finance_transactions
  set description = left(description, length(description) - length(old_tail)) || ' · ' || new.full_name
  where source in ('kuyy_import', 'ticket_manual_paid') and source_ref = 'sp:' || new.id
    and right(description, length(old_tail)) = old_tail;
  return null;
end $$;

-- 2. Simpan line-up host: ronde sebelum `p_from_round` (sudah dikunci) punya pesan sendiri — dulu ikut
--    "Jumlah ronde / court sesi sudah diubah", padahal formatnya tidak berubah. Selebihnya sama persis
--    dengan 20261107030000_lineup_follows_format.
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

  if exists (select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint) where round_no < p_from_round) then
    raise exception 'Ronde sebelum ronde % sudah terkunci — muat ulang halaman lalu atur line-up dari ronde yang belum dimulai', p_from_round;
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_matches, '[]')) as l(round_no smallint, court_no smallint) where round_no > v_s.round_count or court_no < 1 or court_no > v_s.court_count) then
    raise exception 'Jumlah ronde / court sesi sudah diubah (% ronde · % court) — muat ulang halaman lalu atur line-up lagi', v_s.round_count, v_s.court_count;
  end if;
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
