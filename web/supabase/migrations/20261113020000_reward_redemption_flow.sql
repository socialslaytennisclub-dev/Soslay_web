-- Penukaran Slay Point oleh member (sebelumnya tombol "Tukar" member masih nonaktif; penukaran hanya dicatat admin).
--
-- • Kategori baru "product" (Produk): barang non-merch dari partner (raket, bola, grip…).
-- • Produk & Merch → member memilih pengiriman seperti checkout Shop:
--     - J&T / Instant: dibuat order Shop (channel 'reward', subtotal 0) berisi ongkir + kode unik → member
--       transfer & upload bukti di halaman pesanan biasa; admin memverifikasi & mengirim di menu Orders.
--       Ongkir terverifikasi → penukaran otomatis "Disetujui"; order dikirim → "Selesai";
--       order batal (tidak dibayar / bukti ditolak 3×) → penukaran ditolak & poin + stok kembali.
--     - Ambil di activity: pilih activity mana pun yang akan datang (14 hari), tanpa ongkir.
-- • Voucher / Sesi / Pengalaman → admin mengetik kode voucher (+ berlaku sampai, opsional) saat menyetujui;
--   kode tampil di akun member.
-- • Poin & stok dipotong saat member menukar (bukan saat admin menyetujui) supaya saldo tidak bisa dipakai dua
--   kali; ditolak / batal → dikembalikan. Penukaran lama yang dicatat admin (belum dipotong) tetap dipotong saat
--   disetujui seperti sebelumnya.
--
-- Catatan: nilai enum baru 'product' tidak dipakai sebagai literal di file ini (Postgres melarang memakai nilai
-- enum baru dalam transaksi yang sama) — pengecekan kategori fisik memakai category::text.

alter type reward_category add value if not exists 'product' before 'session';

-- Berat untuk ongkir J&T (gram, per item).
alter table rewards add column weight_grams integer not null default 300 check (weight_grams > 0);

alter table reward_redemptions
  add column delivery_method     shipping_method,
  add column pickup_session_id   uuid references sessions(id) on delete set null,
  add column order_id            uuid references orders(id) on delete set null,
  add column recipient           jsonb,           -- {name, phone, address, city, postal_code}
  add column voucher_code        text check (length(voucher_code) <= 80),
  add column voucher_valid_until date;
create index reward_redemptions_order_idx on reward_redemptions (order_id) where order_id is not null;

-- Member tidak lagi menulis langsung ke tabel (harus lewat redeem_reward supaya poin & pengiriman tercatat);
-- admin tetap bisa mencatat penukaran atas nama member.
drop policy "request redemption" on reward_redemptions;
create policy "admin record redemption" on reward_redemptions for insert with check (has_permission('members', 'edit'));

-- ── Ongkir J&T / Instant (aturan sama dengan place_shop_order) ─────────────
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

-- ── Member menukar poin ────────────────────────────────────────────────────
-- p_ship (Produk / Merch saja): {method: jnt|instant|pickup, name, phone, address, city, postal_code, lat, lng, session_id}.
-- Hasil: {code, order_code} — order_code terisi untuk J&T / Instant (member lanjut bayar ongkir di halaman pesanan).
create function redeem_reward(p_reward uuid, p_ship jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member   uuid := auth.uid();
  v_reward   rewards;
  v_tier     member_tier;
  v_balance  integer;
  v_physical boolean;
  v_method   shipping_method;
  v_session  uuid;
  v_quote    jsonb;
  v_code     smallint;
  v_bank     jsonb := (select value from app_settings where key = 'shop_bank');
  v_order    orders;
  v_rd       reward_redemptions;
  v_ledger   bigint;
begin
  if v_member is null then raise exception 'Masuk dulu untuk menukar poin.' using errcode = '42501'; end if;
  -- Kunci member: dua penukaran bersamaan tidak boleh sama-sama lolos cek saldo.
  perform 1 from profiles where id = v_member for update;
  select tier into v_tier from profiles where id = v_member;
  if not found then raise exception 'Profil member tidak ditemukan.' using errcode = '42501'; end if;
  perform 1 from rewards where id = p_reward for update;
  select * into v_reward from rewards where id = p_reward;
  if not found or not v_reward.is_active then raise exception 'Reward tidak tersedia.' using errcode = 'P0002'; end if;
  if v_tier < v_reward.min_tier then raise exception 'Reward ini khusus tier % ke atas.', v_reward.min_tier using errcode = '22023'; end if;
  if v_reward.stock is not null and v_reward.stock < 1 then raise exception 'Stok reward habis.' using errcode = '22023'; end if;
  select coalesce(sum(delta), 0) into v_balance from points_ledger where member_id = v_member;
  if v_balance < v_reward.points_cost then
    raise exception 'Poin kamu belum cukup (% dari % pts).', v_balance, v_reward.points_cost using errcode = '22023';
  end if;

  v_physical := v_reward.category::text in ('merch', 'product');
  if v_physical then
    if p_ship is null or coalesce(p_ship->>'method', '') not in ('jnt', 'instant', 'pickup') then
      raise exception 'Pilih cara pengiriman.' using errcode = '22023';
    end if;
    v_method := (p_ship->>'method')::shipping_method;
    if coalesce(trim(p_ship->>'name'), '') = '' or coalesce(trim(p_ship->>'phone'), '') = '' then
      raise exception 'Isi nama & nomor HP penerima.' using errcode = '22023';
    end if;
    if v_method = 'pickup' then
      -- Activity mana pun yang terbit & dimulai dalam 14 hari ke depan.
      v_session := (p_ship->>'session_id')::uuid;
      if not exists (select 1 from sessions s where s.id = v_session and s.status = 'published' and s.starts_at > now() and s.starts_at < now() + interval '14 days') then
        raise exception 'Activity untuk mengambil reward tidak tersedia — pilih activity lain.' using errcode = '22023';
      end if;
    else
      if coalesce(trim(p_ship->>'address'), '') = '' or coalesce(trim(p_ship->>'city'), '') = '' or coalesce(trim(p_ship->>'postal_code'), '') = '' then
        raise exception 'Lengkapi alamat, kota & kode pos.' using errcode = '22023';
      end if;
      v_quote := shop_shipping_quote(p_ship, v_reward.weight_grams);

      -- Order ongkir: alur bayar transfer + bukti + verifikasi + kirim memakai order Shop yang sudah ada.
      perform pg_advisory_xact_lock(hashtext('shop_unique_code'));
      select c into v_code from generate_series(1, 999) c
      where c not in (select unique_code from orders where status = 'pending' and payment_status = 'pending')
      order by random() limit 1;
      if v_code is null then raise exception 'Terlalu banyak pesanan menunggu pembayaran — coba lagi sebentar.' using errcode = '55000'; end if;
      insert into orders (member_id, channel, subtotal, shipping_fee, total, unique_code, payment_method, payment_bank,
        recipient_name, recipient_phone, shipping_address, shipping_method, shipping_city, postal_code, shipping_lat, shipping_lng,
        distance_km, weight_grams, shipping_snapshot, courier, pay_deadline)
      values (v_member, 'reward', 0, (v_quote->>'fee')::int, (v_quote->>'fee')::int + v_code, v_code,
        'Transfer ' || coalesce(v_bank->>'short', 'BCA'), v_bank,
        left(trim(p_ship->>'name'), 80), left(trim(p_ship->>'phone'), 20), left(trim(p_ship->>'address'), 300),
        v_method, p_ship->>'city', nullif(trim(p_ship->>'postal_code'), ''),
        case when v_method = 'instant' then (p_ship->>'lat')::float8 end, case when v_method = 'instant' then (p_ship->>'lng')::float8 end,
        (v_quote->>'km')::numeric, v_reward.weight_grams, v_quote->'snapshot',
        case v_method when 'jnt' then 'J&T Express Reguler' else 'Instant' end,
        now() + interval '24 hours')
      returning * into v_order;
      insert into order_items (order_id, variant_id, product_name, options, unit_price, quantity)
      values (v_order.id, null, 'Reward: ' || v_reward.name, '{}', 0, 1);
    end if;
  elsif p_ship is not null then
    raise exception 'Reward ini tidak dikirim — kode voucher diberikan admin setelah disetujui.' using errcode = '22023';
  end if;

  insert into reward_redemptions (member_id, reward_id, points) values (v_member, v_reward.id, v_reward.points_cost)
  returning * into v_rd;

  insert into points_ledger (member_id, delta, reason, note)
  values (v_member, -v_reward.points_cost, 'redeem', 'Tukar ' || v_reward.name || ' (#' || v_rd.code || ')')
  returning id into v_ledger;
  update rewards set stock = stock - 1 where id = v_reward.id and stock is not null;
  update reward_redemptions set ledger_id = v_ledger, delivery_method = v_method, pickup_session_id = v_session, order_id = v_order.id,
    recipient = case when v_physical then jsonb_build_object('name', trim(p_ship->>'name'), 'phone', trim(p_ship->>'phone'),
      'address', nullif(trim(p_ship->>'address'), ''), 'city', nullif(p_ship->>'city', ''), 'postal_code', nullif(trim(p_ship->>'postal_code'), '')) end
  where id = v_rd.id;

  return jsonb_build_object('code', v_rd.code, 'order_code', v_order.code);
end $$;
revoke all on function redeem_reward(uuid, jsonb) from public, anon;
grant execute on function redeem_reward(uuid, jsonb) to authenticated;

-- ── Admin memproses penukaran (+ kode voucher) ─────────────────────────────
drop function set_redemption_status(text, redemption_status, text);
create function set_redemption_status(p_code text, p_status redemption_status, p_note text default null,
  p_voucher_code text default null, p_valid_until date default null)
returns reward_redemptions language plpgsql security definer set search_path = public as $$
declare
  rd reward_redemptions%rowtype;
  rw rewards%rowtype;
  o  orders;
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
  if rd.order_id is not null then select * into o from orders where id = rd.order_id for update; end if;

  if rd.status = 'pending' and p_status = 'approved' then
    if rw.category::text in ('voucher', 'session', 'experience') and coalesce(trim(p_voucher_code), '') = '' then
      raise exception 'Isi kode voucher untuk member.';
    end if;
    if o.id is not null and o.payment_status <> 'paid' then
      raise exception 'Ongkir #% belum dibayar / diverifikasi — verifikasi di menu Orders dulu.', o.code;
    end if;
    -- Penukaran lama yang dicatat admin belum memotong poin → potong sekarang.
    if rd.ledger_id is null then
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
    end if;
    update reward_redemptions set voucher_code = nullif(trim(p_voucher_code), ''), voucher_valid_until = p_valid_until where id = rd.id;
  elsif rd.status in ('pending', 'approved') and p_status = 'rejected' then
    if rd.ledger_id is not null then
      insert into points_ledger (member_id, delta, reason, note, created_by)
      values (rd.member_id, rd.points, 'adjustment', 'Pengembalian poin #' || rd.code, auth.uid());
      update rewards set stock = stock + 1 where id = rw.id and stock is not null;
    end if;
    -- Ongkir yang belum dibayar ikut dibatalkan (trigger order melihat penukaran sudah ditolak → tidak dobel).
    update reward_redemptions set status = 'rejected' where id = rd.id;
    if o.id is not null and o.status = 'pending' then
      update orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), cancel_reason = 'Penukaran reward dibatalkan admin'
      where id = o.id;
    end if;
  elsif not (rd.status = 'approved' and p_status = 'fulfilled') then
    raise exception 'Status % tidak bisa diubah ke %', rd.status, p_status;
  end if;

  update reward_redemptions
     set status = p_status, note = coalesce(nullif(trim(p_note), ''), note), handled_by = auth.uid(), handled_at = now()
   where id = rd.id
  returning * into rd;
  return rd;
end $$;
revoke all on function set_redemption_status(text, redemption_status, text, text, date) from public, anon;
grant execute on function set_redemption_status(text, redemption_status, text, text, date) to authenticated;

-- ── Order ongkir reward → status penukaran ─────────────────────────────────
create function orders_sync_redemption() returns trigger language plpgsql security definer set search_path = public as $$
declare
  rd reward_redemptions;
begin
  select * into rd from reward_redemptions where order_id = new.id and status in ('pending', 'approved') for update;
  if not found then return null; end if;
  if new.status = 'cancelled' then
    if rd.ledger_id is not null then
      insert into points_ledger (member_id, delta, reason, note)
      values (rd.member_id, rd.points, 'adjustment', 'Pengembalian poin #' || rd.code || ' (ongkir tidak dibayar)');
      update rewards set stock = stock + 1 where id = rd.reward_id and stock is not null;
    end if;
    update reward_redemptions set status = 'rejected', note = coalesce(note, new.cancel_reason), handled_at = now() where id = rd.id;
  elsif new.status in ('shipped', 'completed') then
    update reward_redemptions set status = 'fulfilled', handled_at = now() where id = rd.id;
  elsif new.payment_status = 'paid' and rd.status = 'pending' then
    update reward_redemptions set status = 'approved', handled_at = now() where id = rd.id;
  end if;
  return null;
end $$;
create trigger orders_redemption_sync after update of status, payment_status on orders
  for each row when (new.channel = 'reward') execute function orders_sync_redemption();
