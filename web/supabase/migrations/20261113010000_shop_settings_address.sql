-- Pengaturan Shop di admin (Settings › Shop & pengiriman) + alamat pengiriman di profil member.
--
-- • Rekening tujuan transfer → app_settings key 'shop_bank' (JSON). Dibaca halaman pesanan member
--   (app_settings sudah bisa dibaca semua; tulis = izin settings edit).
-- • Alamat gudang + titik peta & ongkir Instant → shipping_instant_settings (sudah ada).
-- • Ongkir J&T per kota → shipping_rates (sudah ada).
--   Keduanya kini bisa diubah tim dengan izin edit Orders ATAU Settings.
-- • Alamat pengiriman member (+ titik peta untuk Instant) → kolom ship_* di profiles; dipakai
--   untuk mengisi otomatis form checkout. Member mengubahnya sendiri (RLS profiles yang ada).

-- ── Rekening tujuan transfer ───────────────────────────────────────────────
insert into app_settings (key, value) values (
  'shop_bank',
  jsonb_build_object(
    'bank', 'Bank Central Asia (BCA)',
    'short', 'BCA',
    'accountNo', '123 456 7890',
    'accountName', 'Social Slay Tennis Club',
    'bankCode', '014'
  )
) on conflict (key) do nothing;

-- ── Izin ubah ongkir: Orders edit atau Settings edit ───────────────────────
drop policy "admin write shipping rates" on shipping_rates;
create policy "admin write shipping rates" on shipping_rates for all
  using (has_permission('orders', 'edit') or has_permission('settings', 'edit'))
  with check (has_permission('orders', 'edit') or has_permission('settings', 'edit'));

drop policy "admin write instant settings" on shipping_instant_settings;
create policy "admin write instant settings" on shipping_instant_settings for all
  using (has_permission('orders', 'edit') or has_permission('settings', 'edit'))
  with check (has_permission('orders', 'edit') or has_permission('settings', 'edit'));

-- Nama kota ongkir J&T mengikuti daftar resmi Kemendagri (dropdown provinsi → kabupaten/kota,
-- web/src/content/wilayah.ts). Isi awal dari 20261113000000 diganti ke nama resminya.
update shipping_rates r set city = m.new_city, province = m.new_province, updated_at = now()
from (values
  ('Jakarta Selatan', 'Kota Jakarta Selatan', 'DKI Jakarta'),
  ('Jakarta Pusat',   'Kota Jakarta Pusat',   'DKI Jakarta'),
  ('Jakarta Barat',   'Kota Jakarta Barat',   'DKI Jakarta'),
  ('Jakarta Timur',   'Kota Jakarta Timur',   'DKI Jakarta'),
  ('Jakarta Utara',   'Kota Jakarta Utara',   'DKI Jakarta'),
  ('Tangerang',       'Kota Tangerang',       'Banten'),
  ('Bekasi',          'Kota Bekasi',          'Jawa Barat'),
  ('Depok',           'Kota Depok',           'Jawa Barat'),
  ('Bogor',           'Kota Bogor',           'Jawa Barat'),
  ('Bandung',         'Kota Bandung',         'Jawa Barat'),
  ('Bali',            'Kota Denpasar',        'Bali')
) as m(old_city, new_city, new_province)
where r.city = m.old_city
  and not exists (select 1 from shipping_rates x where x.city = m.new_city);

-- Ongkir Instant: tarif dasar mencakup 3 km pertama (sebelumnya 5 km). Tetap bisa diubah admin.
alter table shipping_instant_settings alter column base_km set default 3;
update shipping_instant_settings set base_km = 3, updated_at = now() where base_km = 5;

alter table shipping_instant_settings
  add constraint shipping_instant_settings_numbers check (base_fee >= 0 and base_km >= 0 and per_km_fee >= 0 and max_km > 0),
  add constraint shipping_instant_settings_origin check (origin_lat between -90 and 90 and origin_lng between -180 and 180);

-- ── Alamat pengiriman member ───────────────────────────────────────────────
alter table profiles
  add column ship_recipient    text,
  add column ship_phone        text,
  add column ship_address      text,
  add column ship_city         text,
  add column ship_postal_code  text check (ship_postal_code is null or ship_postal_code ~ '^\d{5}$'),
  add column ship_lat          double precision check (ship_lat is null or ship_lat between -90 and 90),
  add column ship_lng          double precision check (ship_lng is null or ship_lng between -180 and 180),
  add constraint profiles_ship_pin_pair check ((ship_lat is null) = (ship_lng is null));

-- ── Rekening tujuan dicatat per pesanan ────────────────────────────────────
-- Admin bisa mengganti rekening kapan saja; pesanan yang sudah dibuat tetap menampilkan rekening saat itu.
alter table orders add column payment_bank jsonb;

-- ── Ongkir J&T / Instant: satu-satunya rumus di database (place_shop_order & redeem_reward) ──
-- Sama dengan web/src/lib/checkout.ts (pratinjau di browser).
-- p_ship: {method, city, lat, lng}; hasil: {fee, km, snapshot}. Instant = kota DKI Jakarta (daftar resmi).
create function shop_shipping_quote(p_ship jsonb, p_weight integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rate    shipping_rates;
  v_instant shipping_instant_settings;
  v_km      numeric(5, 1);
  v_kg      integer := greatest(1, ceil(p_weight / 1000.0))::int;
begin
  if p_ship->>'method' = 'jnt' then
    select * into v_rate from shipping_rates where city = p_ship->>'city' and is_active;
    if not found then raise exception 'Pengiriman ke kota ini belum tersedia, hubungi admin.' using errcode = '22023'; end if;
    return jsonb_build_object('fee', v_rate.per_kg * v_kg, 'km', null,
      'snapshot', jsonb_build_object('city', v_rate.city, 'per_kg', v_rate.per_kg, 'weight_grams', p_weight, 'kg', v_kg));
  end if;
  if p_ship->>'city' not in ('Kota Jakarta Barat', 'Kota Jakarta Pusat', 'Kota Jakarta Selatan', 'Kota Jakarta Timur', 'Kota Jakarta Utara', 'Kabupaten Kepulauan Seribu') then
    raise exception 'Instant hanya untuk alamat di DKI Jakarta.' using errcode = '22023';
  end if;
  if (p_ship->>'lat') is null or (p_ship->>'lng') is null then raise exception 'Atur titik lokasi di peta dulu.' using errcode = '22023'; end if;
  select * into v_instant from shipping_instant_settings;
  v_km := shop_distance_km((p_ship->>'lat')::float8, (p_ship->>'lng')::float8);
  if v_km > v_instant.max_km then raise exception 'Titik lokasi lebih dari % km — Instant tidak tersedia.', v_instant.max_km using errcode = '22023'; end if;
  return jsonb_build_object(
    'fee', ceil((v_instant.base_fee + ceil(greatest(0, v_km - v_instant.base_km))::int * v_instant.per_km_fee) / 1000.0)::int * 1000,
    'km', v_km,
    'snapshot', jsonb_build_object('km', v_km, 'base_fee', v_instant.base_fee, 'base_km', v_instant.base_km, 'per_km_fee', v_instant.per_km_fee));
end $$;
revoke all on function shop_shipping_quote(jsonb, integer) from public, anon, authenticated;

-- ── place_shop_order: Instant = kota DKI Jakarta (daftar resmi) + rekening di-snapshot ─────────────
-- Salinan dari 20261113000000 dengan perubahan: ongkir lewat shop_shipping_quote (Instant = kota DKI Jakarta,
-- tidak bergantung baris ongkir J&T), dan app_settings 'shop_bank' disimpan ke orders.payment_bank (+ payment_method).
create or replace function place_shop_order(p_items jsonb, p_ship jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_member   uuid := auth.uid();
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
begin
  if v_member is null then raise exception 'Masuk dulu untuk checkout.' using errcode = '42501'; end if;
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
    now() + interval '24 hours', v_bank)
  returning * into v_order;

  insert into order_items (order_id, variant_id, product_name, options, unit_price, quantity)
  select v_order.id, (l->>'variant_id')::uuid, l->>'name', l->'options', (l->>'price')::int, (l->>'qty')::int
  from jsonb_array_elements(v_lines) l;

  delete from cart_items where member_id = v_member;
  return v_order.code;
end $$;
revoke all on function place_shop_order(jsonb, jsonb) from public, anon;
grant execute on function place_shop_order(jsonb, jsonb) to authenticated;

-- ── Simpan Settings › Shop & pengiriman dalam satu transaksi ───────────────
-- Rekening, gudang + ongkir Instant, dan daftar ongkir J&T: semua tersimpan atau tidak sama sekali.
-- p_rates: [{"city", "province", "per_kg", "eta_days", "is_active"}] — daftar lengkap; kota yang tidak ada dihapus.
create function save_shop_settings(p_bank jsonb, p_instant jsonb, p_rates jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not has_permission('settings', 'edit') then
    raise exception 'Tidak punya izin mengubah pengaturan.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'array' then raise exception 'Data ongkir J&T tidak valid.' using errcode = '22023'; end if;

  insert into app_settings (key, value, updated_at) values ('shop_bank', p_bank, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into shipping_instant_settings (id, origin_address, origin_lat, origin_lng, base_fee, base_km, per_km_fee, max_km, cutoff_time, updated_at)
  values (true, p_instant->>'origin_address', (p_instant->>'origin_lat')::float8, (p_instant->>'origin_lng')::float8,
    (p_instant->>'base_fee')::int, (p_instant->>'base_km')::numeric, (p_instant->>'per_km_fee')::int, (p_instant->>'max_km')::numeric,
    (p_instant->>'cutoff_time')::time, now())
  on conflict (id) do update set origin_address = excluded.origin_address, origin_lat = excluded.origin_lat, origin_lng = excluded.origin_lng,
    base_fee = excluded.base_fee, base_km = excluded.base_km, per_km_fee = excluded.per_km_fee, max_km = excluded.max_km,
    cutoff_time = excluded.cutoff_time, updated_at = excluded.updated_at;

  delete from shipping_rates where city not in (select r->>'city' from jsonb_array_elements(p_rates) r);
  insert into shipping_rates (city, province, per_kg, eta_days, is_active, updated_at)
  select r->>'city', r->>'province', (r->>'per_kg')::int, coalesce(nullif(r->>'eta_days', ''), '2–3'), coalesce((r->>'is_active')::boolean, true), now()
  from jsonb_array_elements(p_rates) r
  on conflict (city) do update set province = excluded.province, per_kg = excluded.per_kg, eta_days = excluded.eta_days,
    is_active = excluded.is_active, updated_at = excluded.updated_at;
end $$;
revoke all on function save_shop_settings(jsonb, jsonb, jsonb) from public, anon;
grant execute on function save_shop_settings(jsonb, jsonb, jsonb) to authenticated;
