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
