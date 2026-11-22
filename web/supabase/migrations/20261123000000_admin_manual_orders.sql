-- Admin Orders · "Input order lama": pembelian merch yang terjadi di luar checkout website (DM / bazar / sebelum
-- Shop online) dicatat langsung sebagai order selesai & lunas (channel 'manual').
--
-- Pembeli: member Soslay (member_id) atau tamu (nama + nomor HP saja).
-- Keuangan: tidak ada logika khusus — trigger orders_finance yang sudah ada memanggil finance_sync_auto dengan
-- paid_at = tanggal bayar yang diisi admin, jadi aturan go-live di Pengaturan Keuangan berlaku: tanggal bayar
-- sebelum go-live → tidak dicatat; sejak go-live → Pemasukan · Penjualan merchandise · akun bank default.
-- Stok tidak dipotong (barang lama sudah keluar sebelum stok di admin dihitung) & Slay Point tidak diberikan.

create function admin_record_manual_order(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_member   uuid := nullif(p->>'member_id', '')::uuid;
  v_name     text := left(trim(coalesce(p->>'name', '')), 80);
  v_phone    text := left(trim(coalesce(p->>'phone', '')), 20);
  v_date     date := (p->>'paid_on')::date;
  v_at       timestamptz;
  v_ship     integer := greatest(coalesce((p->>'shipping_fee')::int, 0), 0);
  v_subtotal integer;
  v_order    orders;
  it         jsonb;
begin
  if not has_permission('orders', 'edit') then raise exception 'Tidak punya izin mengubah Orders.' using errcode = '42501'; end if;
  if v_date is null or v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Isi tanggal bayar (tidak boleh di masa depan).' using errcode = '22023';
  end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Tambahkan minimal satu produk.' using errcode = '22023';
  end if;
  if v_member is not null then
    select coalesce(nullif(v_name, ''), full_name), coalesce(nullif(v_phone, ''), phone, '') into v_name, v_phone from profiles where id = v_member;
    if not found then raise exception 'Member tidak ditemukan.' using errcode = 'P0002'; end if;
  elsif v_name = '' then
    raise exception 'Pilih member atau isi nama pembeli.' using errcode = '22023';
  end if;

  select sum((i->>'unit_price')::int * (i->>'quantity')::int) into v_subtotal from jsonb_array_elements(p->'items') i;
  if exists (
    select 1 from jsonb_array_elements(p->'items') i
    where coalesce(trim(i->>'product_name'), '') = '' or coalesce((i->>'quantity')::int, 0) <= 0 or coalesce((i->>'unit_price')::int, -1) < 0
  ) then
    raise exception 'Lengkapi nama produk, jumlah & harga tiap baris.' using errcode = '22023';
  end if;

  -- Jam 12.00 WIB: tanggal WIB tetap sama di semua tampilan & di Keuangan.
  v_at := (v_date + time '12:00') at time zone 'Asia/Jakarta';
  insert into orders (member_id, status, payment_status, payment_method, channel, subtotal, shipping_fee, total,
    recipient_name, recipient_phone, shipping_address, courier, placed_at, paid_at, completed_at)
  values (v_member, 'completed', 'paid', nullif(left(trim(coalesce(p->>'payment_method', '')), 40), ''), 'manual',
    v_subtotal, v_ship, v_subtotal + v_ship, v_name, v_phone, left(trim(coalesce(p->>'address', '')), 300),
    nullif(left(trim(coalesce(p->>'courier', '')), 40), ''), v_at, v_at, v_at)
  returning * into v_order;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into order_items (order_id, product_name, options, unit_price, quantity)
    values (v_order.id, left(trim(it->>'product_name'), 120),
      case when coalesce(trim(it->>'variant'), '') = '' then '{}'::jsonb else jsonb_build_object('label', left(trim(it->>'variant'), 60)) end,
      (it->>'unit_price')::int, (it->>'quantity')::int);
  end loop;
  return v_order.code;
end $$;
revoke all on function admin_record_manual_order(jsonb) from public, anon;
grant execute on function admin_record_manual_order(jsonb) to authenticated;
