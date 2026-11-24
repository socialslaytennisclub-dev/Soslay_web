-- Total spent member: satu aturan di database untuk kartu "Total spent" (detail member) dan
-- "Member spent terbanyak" (Overview). Sebelumnya dihitung di server web dari tabel yang dilindungi RLS
-- Activities — staf dengan izin Members saja (mis. Kasir Shop) melihat angka shop saja tanpa peringatan.
--
-- Security definer (seperti session_fill_counts / member_kudos): staf dengan izin Members melihat angka
-- utuh; selain itu kosong. Yang keluar hanya nominal per pembayaran / per member, bukan daftar peserta.
--
-- Aturan (member_spend_items):
--  · activity — satu baris per (member, activity): nominal terbesar dari peserta yang lunas & nominalnya
--    diisi (impor Kuyy / tambahan admin — participant_payment_editable) dan booking yang lunas & tidak batal.
--    Diambil yang terbesar, bukan dijumlah: trigger session_participant_payment_sync menyalin nominal &
--    status peserta ke booking source 'kuy' miliknya, jadi keduanya adalah pembayaran yang sama.
--    Activity yang dibatalkan → tiket dianggap dikembalikan, tidak dihitung. Refund / belum bayar → tidak.
--  · trip — DP / cicilan / pelunasan paket: trip_payment_target (sama dengan Keuangan) → pembayaran yang
--    dibatalkan (voided) atau dari pendaftaran yang dibatalkan bernilai 0 dan tidak dihitung.
--  · shop — order lunas (sama dengan member_stats.total_spent; refund → payment_status refunded).
-- Ghost member (peserta impor tanpa akun) belum punya member_id, jadi belum ikut.

create function member_spend_items(p_member uuid default null)
returns table (member_id uuid, kind text, ref text, title text, payment_kind text, at timestamptz, amount bigint)
language sql stable security definer set search_path = public as $$
  with activity as (
    select x.member_id, x.session_id, max(x.amount)::bigint as amount
    from (
      select p.member_id, p.session_id, p.amount
      from session_participants p
      where p.member_id is not null and p.payment_status = 'paid' and p.amount > 0 and participant_payment_editable(p)
      union all
      select b.member_id, b.session_id, b.amount
      from bookings b
      where b.payment_status = 'paid' and b.status <> 'cancelled' and b.amount > 0
    ) x
    where p_member is null or x.member_id = p_member
    group by x.member_id, x.session_id
  )
  select a.member_id, 'activity', a.session_id::text, s.title, null, s.starts_at, a.amount
  from activity a
  join sessions s on s.id = a.session_id
  where s.status <> 'cancelled'
  union all
  select tb.member_id, 'trip', tp.id::text, t.title, tp.kind, (tp.received_on + time '12:00') at time zone 'Asia/Jakarta',
         trip_payment_target(tp.amount, tp.voided_at, tb.cancelled_at)
  from trip_payments tp
  join trip_bookings tb on tb.id = tp.booking_id
  join trips t on t.id = tb.trip_id
  where tb.member_id is not null and (p_member is null or tb.member_id = p_member)
    and trip_payment_target(tp.amount, tp.voided_at, tb.cancelled_at) > 0
  union all
  select o.member_id, 'shop', o.code, null, null, o.placed_at, o.total::bigint
  from orders o
  where o.member_id is not null and (p_member is null or o.member_id = p_member)
    and o.payment_status = 'paid' and o.total > 0
$$;
-- Hanya dipanggil dari dua fungsi di bawah (yang memeriksa izin), tidak langsung dari browser.
revoke execute on function member_spend_items(uuid) from public, anon, authenticated;

/** Rincian pembayaran satu member (tab "Total spent"). Staf tanpa izin Members → kosong. */
create function member_spend(p_member uuid)
returns table (kind text, ref text, title text, payment_kind text, at timestamptz, amount bigint)
language sql stable security definer set search_path = public as $$
  select i.kind, i.ref, i.title, i.payment_kind, i.at, i.amount
  from member_spend_items(p_member) i
  where p_member is not null and has_permission('members', 'view')
  order by i.at desc
$$;
revoke execute on function member_spend(uuid) from public, anon;
grant execute on function member_spend(uuid) to authenticated;

/**
 * Peringkat member berdasarkan total spent (kartu Overview). spenders = jumlah member yang pernah membayar.
 * Staf tanpa izin Members → kosong.
 */
create function member_spend_top(p_limit integer default 5)
returns table (member_id uuid, activities bigint, trips bigint, shop bigint, total bigint, spenders integer)
language sql stable security definer set search_path = public as $$
  select t.member_id, t.activities, t.trips, t.shop, t.total, (count(*) over ())::integer
  from (
    select i.member_id,
           coalesce(sum(i.amount) filter (where i.kind = 'activity'), 0)::bigint as activities,
           coalesce(sum(i.amount) filter (where i.kind = 'trip'), 0)::bigint as trips,
           coalesce(sum(i.amount) filter (where i.kind = 'shop'), 0)::bigint as shop,
           sum(i.amount)::bigint as total
    from member_spend_items() i
    where has_permission('members', 'view')
    group by i.member_id
  ) t
  join profiles pr on pr.id = t.member_id
  order by t.total desc, pr.full_name
  limit greatest(p_limit, 0)
$$;
revoke execute on function member_spend_top(integer) from public, anon;
grant execute on function member_spend_top(integer) to authenticated;
