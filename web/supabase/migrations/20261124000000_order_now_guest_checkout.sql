-- Order Now (/ordernow): tamu daftar akun & langsung order dalam satu halaman (diminta 24 Nov 2026).
--
-- Akun baru belum bisa login sebelum email diverifikasi, jadi server (service role) membuat order atas nama
-- akun itu (stok dipegang), lalu pembeli memverifikasi email dulu sebelum bisa bayar dari akunnya. Order dari
-- akun yang tidak diverifikasi dalam 1 jam dibatalkan otomatis & stoknya kembali (bot tidak bisa menahan stok).
-- Isi place_shop_order dipindah ke place_shop_order_for(p_member, …) yang hanya bisa dipanggil service role;
-- versi member tetap sama (memanggil *_for dengan auth.uid()). Bayar & bukti tetap lewat akun (setelah verifikasi).

/**
 * Isi place_shop_order dengan akun eksplisit. `p_replace_pending` (Order Now: kirim ulang) = pesanan website akun
 * ini yang belum dibayar dibatalkan dulu di transaksi yang sama (stok kembali), lalu diganti pesanan ini.
 * Di dalam check_shop_order (app.order_dry_run) berhenti setelah validasi stok & ongkir — sebelum kunci kode unik.
 */
create function place_shop_order_for(p_member uuid, p_items jsonb, p_ship jsonb, p_replace_pending boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_member   uuid := p_member;
  v_method   shipping_method := (p_ship->>'method')::shipping_method;
  v_item     jsonb;
  v_variant  record;
  v_qty      integer;
  v_subtotal integer := 0;
  v_weight   integer := 0;
  v_fee      integer := 0;
  v_km       numeric(5, 1);
  v_session  uuid;
  v_quote    jsonb;
  v_snapshot jsonb;
  v_code     smallint;
  v_order    orders;
  v_lines    jsonb := '[]';
  v_bank     jsonb := (select value from app_settings where key = 'shop_bank');
  v_dry      boolean := coalesce(current_setting('app.order_dry_run', true), '') = 'on';
begin
  if not v_dry then
    if v_member is null or not exists (select 1 from profiles where id = v_member) then
      raise exception 'Masuk dulu untuk checkout.' using errcode = '42501';
    end if;
    -- Order lewat batas (termasuk akun Order Now yang tidak diverifikasi 1 jam) dilepas dulu → stoknya bisa dipesan.
    perform expire_shop_orders();
    if p_replace_pending then
      update orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
        cancel_reason = 'Diganti pesanan Order Now yang baru'
      where member_id = v_member and status = 'pending' and payment_status = 'pending' and channel = 'website';
    end if;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Belum ada produk dipilih.' using errcode = '22023'; end if;
  if coalesce(trim(p_ship->>'name'), '') = '' or coalesce(trim(p_ship->>'phone'), '') = '' then
    raise exception 'Isi nama & nomor HP penerima.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Jumlah produk tidak valid.' using errcode = '22023'; end if;
    -- Varian paling spesifik yang opsinya termuat di pilihan member (atribut tetap seperti fit ikut terkirim).
    select v.id, v.stock, coalesce(v.price, p.price) price, p.name, coalesce(v.weight_grams, p.weight_grams) weight into v_variant
    from product_variants v join products p on p.id = v.product_id
    where p.slug = v_item->>'slug' and p.status = 'active' and v.options <@ coalesce(v_item->'options', '{}')
    order by (select count(*) from jsonb_object_keys(v.options)) desc
    limit 1
    for update of v;
    if not found then raise exception 'Produk "%" tidak tersedia lagi.', v_item->>'slug' using errcode = 'P0002'; end if;
    if v_variant.stock < v_qty then
      raise exception 'Stok % tinggal %.', v_variant.name, v_variant.stock using errcode = 'P0001', hint = 'out_of_stock';
    end if;
    update product_variants set stock = stock - v_qty where id = v_variant.id;
    v_subtotal := v_subtotal + v_variant.price * v_qty;
    v_weight := v_weight + v_variant.weight * v_qty;
    v_lines := v_lines || jsonb_build_object('variant_id', v_variant.id, 'name', v_variant.name, 'options', coalesce(v_item->'options', '{}'), 'price', v_variant.price, 'qty', v_qty);
  end loop;

  if v_method in ('jnt', 'instant') and (coalesce(trim(p_ship->>'address'), '') = '' or coalesce(trim(p_ship->>'city'), '') = '' or coalesce(trim(p_ship->>'postal_code'), '') = '') then
    raise exception 'Lengkapi alamat, kota & kode pos.' using errcode = '22023';
  end if;
  if v_method in ('jnt', 'instant') then
    v_quote := shop_shipping_quote(p_ship, v_weight);
    v_fee := (v_quote->>'fee')::int;
    v_km := (v_quote->>'km')::numeric;
    v_snapshot := v_quote->'snapshot';
  else
    v_session := (p_ship->>'session_id')::uuid;
    if not pickup_session_ok(v_session) then raise exception 'Sesi Mabar untuk pickup tidak tersedia — pilih sesi lain.' using errcode = '22023'; end if;
  end if;

  -- Uji coba (check_shop_order): stok & ongkir valid → selesai di sini, tanpa kunci kode unik / insert.
  if v_dry then raise exception 'dry run' using errcode = 'SDRY1'; end if;

  -- Kode unik 1–999 yang tidak dipakai order lain yang masih menunggu bayar / verifikasi.
  perform pg_advisory_xact_lock(hashtext('shop_unique_code'));
  select c into v_code from generate_series(1, 999) c
  where c not in (select unique_code from orders where status = 'pending' and payment_status = 'pending')
  order by random() limit 1;
  if v_code is null then raise exception 'Terlalu banyak pesanan menunggu pembayaran — coba lagi sebentar.' using errcode = '55000'; end if;

  insert into orders (member_id, channel, subtotal, shipping_fee, total, unique_code, payment_method,
    recipient_name, recipient_phone, shipping_address, shipping_method, shipping_city, postal_code, shipping_lat, shipping_lng,
    distance_km, weight_grams, shipping_snapshot, pickup_session_id, courier, pay_deadline, payment_bank)
  values (v_member, 'website', v_subtotal, v_fee, v_subtotal + v_fee + v_code, v_code, 'Transfer ' || coalesce(v_bank->>'short', 'BCA'),
    left(trim(p_ship->>'name'), 80), left(trim(p_ship->>'phone'), 20),
    case when v_method = 'pickup' then 'Pickup di Mabar Session' else left(trim(p_ship->>'address'), 300) end,
    v_method, nullif(p_ship->>'city', ''), nullif(trim(p_ship->>'postal_code'), ''),
    case when v_method = 'instant' then (p_ship->>'lat')::float8 end, case when v_method = 'instant' then (p_ship->>'lng')::float8 end,
    v_km, v_weight, v_snapshot, v_session,
    case v_method when 'jnt' then 'J&T Express Reguler' when 'instant' then 'Instant' else 'Pickup Mabar' end,
    -- Pickup: batas bayar H-1 sesi pukul 21.00 WIB bila lebih awal dari 24 jam (sama dengan pickup_session_ok).
    case when v_method = 'pickup' then least(now() + interval '24 hours', pickup_pay_deadline(v_session)) else now() + interval '24 hours' end, v_bank)
  returning * into v_order;

  insert into order_items (order_id, variant_id, product_name, options, unit_price, quantity)
  select v_order.id, (l->>'variant_id')::uuid, l->>'name', l->'options', (l->>'price')::int, (l->>'qty')::int
  from jsonb_array_elements(v_lines) l;

  delete from cart_items where member_id = v_member;
  return v_order.code;
end $$;
revoke all on function place_shop_order_for(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;

/**
 * Uji pesanan tanpa menyimpan apa pun (Order Now, sebelum akun dibuat): place_shop_order_for dijalankan di
 * subtransaksi lalu dibatalkan — stok, kode unik, order & item ikut batal. null = bisa dipesan; teks = alasan
 * gagal (stok habis, kota J&T belum ada, sesi pickup tidak valid, …).
 */
create function check_shop_order(p_items jsonb, p_ship jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  begin
    perform set_config('app.order_dry_run', 'on', true);
    perform place_shop_order_for(null, p_items, p_ship);
    raise exception 'dry run' using errcode = 'SDRY1';
  exception
    when sqlstate 'SDRY1' then return null;
    when others then return sqlerrm;
  end;
end $$;
revoke all on function check_shop_order(jsonb, jsonb) from public, anon, authenticated;

create or replace function place_shop_order(p_items jsonb, p_ship jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Masuk dulu untuk checkout.' using errcode = '42501'; end if;
  return place_shop_order_for(auth.uid(), p_items, p_ship);
end $$;

-- Service role (server Order Now) — sudah lewat default privileges Supabase; ditegaskan bila role ada.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function place_shop_order_for(uuid, jsonb, jsonb, boolean) to service_role;
    grant execute on function check_shop_order(jsonb, jsonb) to service_role;
  end if;
end $$;

-- Pencarian order menunggu bayar (batal otomatis tiap order baru / tiap 5 menit) lewat index kecil.
create index orders_pending_unpaid_idx on orders (placed_at) where status = 'pending' and payment_status = 'pending';

-- Batal otomatis: + order dari akun yang emailnya belum diverifikasi > 1 jam (Order Now) → stok kembali lewat
-- trigger orders_on_cancel. Sama dengan versi 20261113000000 selain blok itu.
create or replace function expire_shop_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  u integer;
  m integer;
begin
  update orders o set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
    cancel_reason = 'Tidak ada bukti transfer sampai batas waktu'
  where o.status = 'pending' and o.payment_status = 'pending' and o.pay_deadline < now()
    and not exists (select 1 from order_payment_proofs p where p.order_id = o.id and p.status = 'pending');
  get diagnostics n = row_count;
  update orders o set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
    cancel_reason = 'Email akun tidak diverifikasi dalam 1 jam'
  from auth.users au
  where au.id = o.member_id and au.email_confirmed_at is null
    and o.status = 'pending' and o.payment_status = 'pending' and o.channel = 'website'
    and o.placed_at < now() - interval '1 hour'
    and not exists (select 1 from order_payment_proofs p where p.order_id = o.id and p.status = 'pending');
  get diagnostics u = row_count;
  update orders set status = 'completed', completed_at = now()
  where status = 'shipped' and shipping_method = 'jnt' and shipped_at < now() - interval '7 days';
  get diagnostics m = row_count;
  return n + u + m;
end $$;

-- Jadwal tiap 5 menit bila pg_cron tersedia (Supabase) — stok order lewat batas / belum verifikasi kembali tanpa
-- menunggu ada yang membuka halaman pesanan. PGlite / tanpa izin → dilewati; aplikasi tetap memanggilnya
-- (halaman pesanan, Admin Orders, setiap order baru lewat place_shop_order_for).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-shop-orders', '*/5 * * * *', 'select public.expire_shop_orders()');
exception when others then
  raise notice 'pg_cron tidak tersedia (%), order kedaluwarsa hanya lewat aplikasi', sqlerrm;
end $$;
