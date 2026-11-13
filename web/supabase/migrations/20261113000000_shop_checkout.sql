-- Shop checkout & bayar transfer manual (Figma WEB · 03 · Shop — UIF-05 / MOB-05; ADM-03).
-- Aturan: "Aturan bisnis — Shop: Checkout, Pengiriman & Pembayaran Transfer" draft v1 (13 Nov 2026).
--
-- Alur: Keranjang / Buy Now → Checkout (J&T / Instant Jakarta / Free Pickup Mabar) → pesanan dibuat dengan
-- kode unik 3 digit (unik di antara order aktif) & batas bayar 24 jam; stok langsung dikunci; ongkir di-snapshot
-- → member transfer BCA & upload bukti → admin cocokkan mutasi lalu Setujui (lunas → Keuangan A-2 lewat
-- trigger orders_finance yang sudah ada + Slay Point) atau Tolak (member upload ulang, batas +24 jam dari
-- penolakan; tolak ke-3 → batal).
--
-- Status member (§1) diturunkan dari kolom yang ada — enum order_status tidak diubah:
--   menunggu_pembayaran = pending + belum ada bukti, belum pernah ditolak
--   menunggu_verifikasi = pending + ada bukti 'pending'
--   perlu_upload_ulang  = pending + belum ada bukti + proof_rejections > 0
--   diproses = processing · dikirim = shipped (J&T/Instant) · siap_diambil = shipped (Pickup)
--   selesai = completed · dibatalkan = cancelled
-- Otomatis (expire_shop_orders, dipanggil saat halaman pesanan / admin Orders dibuka — idempoten, tanpa cron):
--   lewat batas tanpa bukti → batal & stok dilepas · J&T dikirim > 7 hari → selesai.

create type shipping_method as enum ('jnt', 'instant', 'pickup');
create type proof_status    as enum ('pending', 'approved', 'rejected', 'replaced');

-- ── Berat (ongkir J&T: dibulatkan ke atas per kg, min 1 kg) ─────────────────
alter table products add column weight_grams integer not null default 300 check (weight_grams > 0);
update products set weight_grams = 1000 where category = 'racket';
update products set weight_grams = 200 where category in ('accessory', 'figure');
update products set weight_grams = 100 where category = 'socks';
update products set weight_grams = 50 where category = 'pin';
-- Berat per varian bila beda (null → berat produk).
alter table product_variants add column weight_grams integer check (weight_grams > 0);

-- ── Master ongkir J&T per kota tujuan ──────────────────────────────────────
-- Kota yang tidak ada / nonaktif → opsi J&T nonaktif. CRUD admin menyusul (§13).
create table shipping_rates (
  city        text primary key,
  province    text not null,
  per_kg      integer not null check (per_kg > 0),
  eta_days    text not null default '2–3',
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table shipping_rates enable row level security;
create policy "public read shipping rates" on shipping_rates for select using (true);
create policy "admin write shipping rates" on shipping_rates for all using (has_permission('orders', 'edit')) with check (has_permission('orders', 'edit'));
insert into shipping_rates (city, province, per_kg) values
  ('Jakarta Selatan', 'DKI Jakarta', 18000),
  ('Jakarta Pusat', 'DKI Jakarta', 18000),
  ('Jakarta Barat', 'DKI Jakarta', 18000),
  ('Jakarta Timur', 'DKI Jakarta', 18000),
  ('Jakarta Utara', 'DKI Jakarta', 18000),
  ('Tangerang', 'Banten', 20000),
  ('Bekasi', 'Jawa Barat', 20000),
  ('Depok', 'Jawa Barat', 20000),
  ('Bogor', 'Jawa Barat', 21000),
  ('Bandung', 'Jawa Barat', 22000),
  ('Bali', 'Bali', 27000);

-- ── Pengaturan Instant (satu baris) ─────────────────────────────────────────
-- Ongkir = base_fee + ceil(max(0, km − base_km)) × per_km_fee, dibulatkan ke Rp1.000; maks max_km; DKI saja.
create table shipping_instant_settings (
  id              boolean primary key default true check (id),
  origin_address  text not null,
  origin_lat      double precision not null,
  origin_lng      double precision not null,
  base_fee        integer not null default 15000,
  base_km         numeric not null default 5,
  per_km_fee      integer not null default 3000,
  max_km          numeric not null default 25,
  cutoff_time     time not null default '15:00',
  updated_at      timestamptz not null default now()
);
alter table shipping_instant_settings enable row level security;
create policy "public read instant settings" on shipping_instant_settings for select using (true);
create policy "admin write instant settings" on shipping_instant_settings for all using (has_permission('orders', 'edit')) with check (has_permission('orders', 'edit'));
insert into shipping_instant_settings (origin_address, origin_lat, origin_lng) values ('Soslay · Kemang, Jakarta Selatan', -6.2607, 106.8136);

-- ── Pesanan ────────────────────────────────────────────────────────────────
alter table orders
  add column shipping_method    shipping_method,
  add column shipping_city      text,
  add column postal_code        text,
  add column shipping_lat       double precision,
  add column shipping_lng       double precision,
  add column distance_km        numeric(5, 1),
  add column weight_grams       integer,
  add column shipping_snapshot  jsonb,                 -- J&T: kota, tarif/kg, berat · Instant: jarak & rumus
  add column unique_code        smallint not null default 0 check (unique_code between 0 and 999),
  add column pay_deadline       timestamptz,
  add column proof_rejections   smallint not null default 0,
  add column pickup_session_id  uuid references sessions(id) on delete set null,
  add column tracking_url       text,
  add column points_awarded     integer not null default 0,
  add column verified_by        uuid references staff_members(user_id) on delete set null,
  add column cancel_reason      text;

-- Satu baris per bukti yang diunggah (log: diganti / ditolak / disetujui). Paling banyak satu 'pending'.
create table order_payment_proofs (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  file_path        text not null,                -- bucket privat payment-proofs
  file_name        text not null,
  mime             text not null default '',
  file_size        integer not null default 0,
  sender_name      text not null,
  sender_bank      text not null,
  amount           integer not null check (amount > 0),
  transfer_date    date not null,
  note             text,
  status           proof_status not null default 'pending',
  reject_reason    text,
  reject_message   text,
  funds_confirmed  boolean not null default false,
  uploaded_at      timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references staff_members(user_id) on delete set null
);
create index order_payment_proofs_order_idx on order_payment_proofs (order_id, uploaded_at desc);
create unique index order_payment_proofs_one_pending on order_payment_proofs (order_id) where status = 'pending';
alter table order_payment_proofs enable row level security;
create policy "member read own proofs" on order_payment_proofs for select using (
  exists (select 1 from orders o where o.id = order_id and (o.member_id = auth.uid() or has_permission('orders')))
);

-- ── Helper ─────────────────────────────────────────────────────────────────
-- Pesanan batal → stok varian kembali.
create function release_order_stock(p_order uuid)
returns void language sql security definer set search_path = public as $$
  update product_variants v set stock = v.stock + i.qty
  from (select variant_id, sum(quantity) qty from order_items where order_id = p_order and variant_id is not null group by variant_id) i
  where v.id = i.variant_id;
$$;
revoke all on function release_order_stock(uuid) from public, anon, authenticated;

-- Jarak pengirim (pengaturan Instant) → titik member. Belum memakai Google Maps Routes API (butuh API key
-- & billing, §3.2): garis lurus × 1,3 sebagai perkiraan rute jalan, dibulatkan 0,1 km.
-- Rumus sama dengan web/src/lib/checkout.ts (estimateRouteKm).
create function shop_distance_km(p_lat float8, p_lng float8)
returns numeric language sql stable set search_path = public as $$
  select round((2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - s.origin_lat) / 2), 2) +
    cos(radians(s.origin_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.origin_lng) / 2), 2)
  )) * 1.3)::numeric, 1)
  from shipping_instant_settings s;
$$;

-- Batas bayar pickup: H-1 sesi pukul 21.00 WIB.
create function pickup_pay_deadline(p_session uuid)
returns timestamptz language sql stable set search_path = public as $$
  select (((starts_at at time zone 'Asia/Jakarta')::date - 1) + time '21:00') at time zone 'Asia/Jakarta' from sessions where id = p_session;
$$;

-- Sesi Mabar yang bisa dipilih untuk pickup: 14 hari ke depan, terbit, batas H-1 21.00 belum lewat.
create function pickup_session_ok(p_session uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from sessions s where s.id = p_session and s.type_slug = 'weekly-mabar' and s.status = 'published'
      and s.starts_at < now() + interval '14 days' and pickup_pay_deadline(s.id) > now()
  );
$$;

-- ── Buat pesanan ───────────────────────────────────────────────────────────
-- p_items: [{"slug", "options": {...}, "quantity"}] — harga, stok & ongkir dihitung di sini, bukan dari browser.
-- p_ship: {"method", "name", "phone", "address", "city", "postal_code", "lat", "lng", "session_id"}.
create function place_shop_order(p_items jsonb, p_ship jsonb)
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
  v_rate     shipping_rates;
  v_instant  shipping_instant_settings;
  v_snapshot jsonb;
  v_code     smallint;
  v_order    orders;
  v_lines    jsonb := '[]';
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
  if v_method = 'jnt' then
    select * into v_rate from shipping_rates where city = p_ship->>'city' and is_active;
    if not found then raise exception 'Pengiriman ke kota ini belum tersedia, hubungi admin.' using errcode = '22023'; end if;
    v_fee := v_rate.per_kg * greatest(1, ceil(v_weight / 1000.0))::int;
    v_snapshot := jsonb_build_object('city', v_rate.city, 'per_kg', v_rate.per_kg, 'weight_grams', v_weight, 'kg', greatest(1, ceil(v_weight / 1000.0))::int);
  elsif v_method = 'instant' then
    select * into v_instant from shipping_instant_settings;
    if (select province from shipping_rates where city = p_ship->>'city') is distinct from 'DKI Jakarta' then
      raise exception 'Instant hanya untuk alamat di DKI Jakarta.' using errcode = '22023';
    end if;
    if (p_ship->>'lat') is null or (p_ship->>'lng') is null then raise exception 'Atur titik lokasi di peta dulu.' using errcode = '22023'; end if;
    v_km := shop_distance_km((p_ship->>'lat')::float8, (p_ship->>'lng')::float8);
    if v_km > v_instant.max_km then raise exception 'Titik lokasi lebih dari % km — Instant tidak tersedia.', v_instant.max_km using errcode = '22023'; end if;
    v_fee := ceil((v_instant.base_fee + ceil(greatest(0, v_km - v_instant.base_km))::int * v_instant.per_km_fee) / 1000.0)::int * 1000;
    v_snapshot := jsonb_build_object('km', v_km, 'base_fee', v_instant.base_fee, 'base_km', v_instant.base_km, 'per_km_fee', v_instant.per_km_fee);
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
    distance_km, weight_grams, shipping_snapshot, pickup_session_id, courier, pay_deadline)
  values (v_member, 'website', v_subtotal, v_fee, v_subtotal + v_fee + v_code, v_code, 'Transfer BCA',
    left(trim(p_ship->>'name'), 80), left(trim(p_ship->>'phone'), 20),
    case when v_method = 'pickup' then 'Pickup di Mabar Session' else left(trim(p_ship->>'address'), 300) end,
    v_method, nullif(p_ship->>'city', ''), nullif(trim(p_ship->>'postal_code'), ''),
    case when v_method = 'instant' then (p_ship->>'lat')::float8 end, case when v_method = 'instant' then (p_ship->>'lng')::float8 end,
    v_km, v_weight, v_snapshot, v_session,
    case v_method when 'jnt' then 'J&T Express Reguler' when 'instant' then 'Instant' else 'Pickup Mabar' end,
    now() + interval '24 hours')
  returning * into v_order;

  insert into order_items (order_id, variant_id, product_name, options, unit_price, quantity)
  select v_order.id, (l->>'variant_id')::uuid, l->>'name', l->'options', (l->>'price')::int, (l->>'qty')::int
  from jsonb_array_elements(v_lines) l;

  delete from cart_items where member_id = v_member;
  return v_order.code;
end $$;
revoke all on function place_shop_order(jsonb, jsonb) from public, anon;
grant execute on function place_shop_order(jsonb, jsonb) to authenticated;

-- ── Bukti transfer (member) ────────────────────────────────────────────────
-- File sudah diunggah server ke bucket privat; di sini dicatat. Bukti 'pending' sebelumnya → 'replaced'.
create function submit_payment_proof(p_code text, p_proof jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  perform expire_shop_orders();
  select * into o from orders where code = p_code and member_id = auth.uid() for update;
  if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0002'; end if;
  if o.status <> 'pending' or o.payment_status <> 'pending' then
    raise exception 'Pesanan ini tidak menunggu pembayaran.' using errcode = '22023';
  end if;
  if coalesce(trim(p_proof->>'sender_name'), '') = '' or coalesce(trim(p_proof->>'sender_bank'), '') = ''
     or coalesce((p_proof->>'amount')::int, 0) <= 0 or (p_proof->>'transfer_date') is null then
    raise exception 'Lengkapi nama pengirim, bank, jumlah & tanggal transfer.' using errcode = '22023';
  end if;
  update order_payment_proofs set status = 'replaced' where order_id = o.id and status = 'pending';
  insert into order_payment_proofs (order_id, file_path, file_name, mime, file_size, sender_name, sender_bank, amount, transfer_date, note)
  values (o.id, p_proof->>'path', left(p_proof->>'name', 120), coalesce(p_proof->>'mime', ''), coalesce((p_proof->>'size')::int, 0),
    left(trim(p_proof->>'sender_name'), 80), left(trim(p_proof->>'sender_bank'), 40), (p_proof->>'amount')::int,
    (p_proof->>'transfer_date')::date, nullif(left(trim(p_proof->>'note'), 300), ''));
end $$;
revoke all on function submit_payment_proof(text, jsonb) from public, anon;
grant execute on function submit_payment_proof(text, jsonb) to authenticated;

-- Member konfirmasi pesanan diterima (J&T / Instant yang sudah dikirim).
create function confirm_order_received(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'completed', completed_at = now()
  where code = p_code and member_id = auth.uid() and status = 'shipped' and shipping_method in ('jnt', 'instant');
  if not found then raise exception 'Pesanan tidak bisa dikonfirmasi.' using errcode = '22023'; end if;
end $$;
revoke all on function confirm_order_received(text) from public, anon;
grant execute on function confirm_order_received(text) to authenticated;

-- Pickup: ganti sesi Mabar (sesi lewat batas H-1 / dibatalkan) selama belum diambil.
create function change_pickup_session(p_code text, p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pickup_session_ok(p_session) then raise exception 'Sesi Mabar ini tidak bisa dipilih.' using errcode = '22023'; end if;
  update orders set pickup_session_id = p_session
  where code = p_code and (member_id = auth.uid() or has_permission('orders', 'edit'))
    and shipping_method = 'pickup' and status in ('pending', 'processing', 'shipped');
  if not found then raise exception 'Sesi pickup pesanan ini tidak bisa diganti.' using errcode = '22023'; end if;
end $$;
revoke all on function change_pickup_session(text, uuid) from public, anon;
grant execute on function change_pickup_session(text, uuid) to authenticated;

-- ── Verifikasi (admin, ADM-03) ─────────────────────────────────────────────
create function review_payment_proof(p_code text, p_approve boolean, p_funds_confirmed boolean default false,
  p_reason text default null, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o      orders;
  p      order_payment_proofs;
  v_pts  integer;
begin
  if not has_permission('orders', 'edit') then raise exception 'Tidak punya izin memverifikasi.' using errcode = '42501'; end if;
  select * into o from orders where code = p_code for update;
  if not found then raise exception 'Order tidak ditemukan.' using errcode = 'P0002'; end if;
  select * into p from order_payment_proofs where order_id = o.id and status = 'pending';
  if not found or o.status <> 'pending' then raise exception 'Tidak ada bukti yang menunggu verifikasi.' using errcode = '22023'; end if;

  if p_approve then
    if not p_funds_confirmed then raise exception 'Centang dulu: dana sudah masuk di mutasi rekening.' using errcode = '22023'; end if;
    v_pts := floor(o.subtotal / 10000);
    update order_payment_proofs set status = 'approved', funds_confirmed = true, reviewed_at = now(), reviewed_by = auth.uid() where id = p.id;
    update orders set payment_status = 'paid', status = 'processing', paid_at = now(), verified_by = auth.uid(), points_awarded = v_pts where id = o.id;
    if v_pts > 0 and o.member_id is not null then
      insert into points_ledger (member_id, delta, reason, order_id, note, created_by)
      values (o.member_id, v_pts, 'purchase', o.id, 'Belanja #' || o.code, auth.uid());
    end if;
    return jsonb_build_object('result', 'approved', 'points', v_pts);
  end if;

  if coalesce(trim(p_reason), '') = '' then raise exception 'Pilih alasan penolakan.' using errcode = '22023'; end if;
  if trim(p_reason) = 'Lainnya' and coalesce(trim(p_message), '') = '' then raise exception 'Tulis pesan untuk member.' using errcode = '22023'; end if;
  update order_payment_proofs set status = 'rejected', reject_reason = trim(p_reason), reject_message = nullif(trim(p_message), ''),
    reviewed_at = now(), reviewed_by = auth.uid() where id = p.id;
  if o.proof_rejections + 1 >= 3 then
    update orders set proof_rejections = proof_rejections + 1, status = 'cancelled', payment_status = 'failed',
      cancelled_at = now(), cancel_reason = 'Bukti transfer ditolak 3×' where id = o.id;
    return jsonb_build_object('result', 'cancelled');
  end if;
  update orders set proof_rejections = proof_rejections + 1, pay_deadline = now() + interval '24 hours' where id = o.id;
  return jsonb_build_object('result', 'rejected', 'count', o.proof_rejections + 1);
end $$;
revoke all on function review_payment_proof(text, boolean, boolean, text, text) from public, anon;
grant execute on function review_payment_proof(text, boolean, boolean, text, text) to authenticated;

-- ── Otomatis ───────────────────────────────────────────────────────────────
-- 1) Belum ada bukti (atau bukti terakhir ditolak) sampai pay_deadline → batal (stok dilepas trigger di bawah).
--    Bukti yang sedang menunggu verifikasi tidak ikut dibatalkan.
-- 2) J&T dikirim lebih dari 7 hari → selesai.
create function expire_shop_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  m integer;
begin
  update orders o set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
    cancel_reason = 'Tidak ada bukti transfer sampai batas waktu'
  where o.status = 'pending' and o.payment_status = 'pending' and o.pay_deadline < now()
    and not exists (select 1 from order_payment_proofs p where p.order_id = o.id and p.status = 'pending');
  get diagnostics n = row_count;
  update orders set status = 'completed', completed_at = now()
  where status = 'shipped' and shipping_method = 'jnt' and shipped_at < now() - interval '7 days';
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke all on function expire_shop_orders() from public, anon;
grant execute on function expire_shop_orders() to authenticated;

-- Batal (otomatis / tolak ke-3 / admin) sebelum dikirim → stok kembali; Slay Point yang sudah diberikan dicabut.
create function orders_on_cancel() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Hanya order checkout website (stok dikunci saat dibuat); order lama / Kuy tidak memotong stok.
  if new.status = 'cancelled' and old.status in ('pending', 'processing') and new.shipping_method is not null then
    perform release_order_stock(new.id);
    if new.points_awarded > 0 and new.member_id is not null then
      insert into points_ledger (member_id, delta, reason, order_id, note)
      values (new.member_id, -new.points_awarded, 'adjustment', new.id, 'Order #' || new.code || ' dibatalkan');
    end if;
  end if;
  return null;
end $$;
create trigger orders_cancel_effects after update of status on orders
  for each row execute function orders_on_cancel();
