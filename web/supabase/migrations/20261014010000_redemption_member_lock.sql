-- Kunci baris member saat menyetujui penukaran: dua penukaran berbeda untuk member yang sama
-- yang disetujui bersamaan tidak boleh sama-sama lolos cek saldo.
create or replace function set_redemption_status(p_code text, p_status redemption_status, p_note text default null)
returns reward_redemptions language plpgsql security definer set search_path = public as $$
declare
  rd reward_redemptions%rowtype;
  rw rewards%rowtype;
  balance integer;
  ledger bigint;
begin
  if not has_permission('members', 'edit') then
    raise exception 'Tidak punya izin memproses penukaran';
  end if;

  select * into rd from reward_redemptions where code = p_code for update;
  if not found then
    raise exception 'Penukaran % tidak ditemukan', p_code;
  end if;
  perform 1 from profiles where id = rd.member_id for update;
  select * into rw from rewards where id = rd.reward_id for update;

  if rd.status = 'pending' and p_status = 'approved' then
    select coalesce(sum(delta), 0) into balance from points_ledger where member_id = rd.member_id;
    if balance < rd.points then
      raise exception 'Saldo poin member tidak cukup (% dari % pts)', balance, rd.points;
    end if;
    if rw.stock is not null and rw.stock < 1 then
      raise exception 'Stok reward habis';
    end if;
    insert into points_ledger (member_id, delta, reason, note, created_by)
    values (rd.member_id, -rd.points, 'redeem', 'Tukar ' || rw.name || ' (#' || rd.code || ')', auth.uid())
    returning id into ledger;
    update rewards set stock = stock - 1 where id = rw.id and stock is not null;
    update reward_redemptions set ledger_id = ledger where id = rd.id;
  elsif rd.status = 'approved' and p_status = 'rejected' then
    insert into points_ledger (member_id, delta, reason, note, created_by)
    values (rd.member_id, rd.points, 'adjustment', 'Pengembalian poin #' || rd.code, auth.uid());
    update rewards set stock = stock + 1 where id = rw.id and stock is not null;
  elsif not ((rd.status = 'pending' and p_status = 'rejected') or (rd.status = 'approved' and p_status = 'fulfilled')) then
    raise exception 'Status % tidak bisa diubah ke %', rd.status, p_status;
  end if;

  update reward_redemptions
     set status = p_status, note = coalesce(nullif(trim(p_note), ''), note), handled_by = auth.uid(), handled_at = now()
   where id = rd.id
  returning * into rd;
  return rd;
end $$;
