-- Katalog Shop v2 (Figma 347:2044 · foto diekspor ke public/images/products). Tidak menimpa produk yang sudah ada.
-- Stok awal per varian = 10 (silakan sesuaikan di admin Products).
with p(slug, sku, name, category, subtitle, price, compare_at, featured, sort, image, description, material, fit, color, sizes) as (values
  ('destination-series-bali-white', 'SOS-APP-010', 'Destination Series 01: Bali — White', 'apparel', 'Oversized fit T-shirt', 220000, 280000, false, 10,
   '/images/products/destination-series-bali-white.webp',
   'From our Tennis Escape to Bali — a crisp white tee with the Slay Club flower on the back. Made to play in and to show off afterwards.', null,
   'Oversized Fit', 'White', array['S','M','L','XL','XXL']),
  ('love-game-black-washed', 'SOS-APP-011', 'Love Game — Black Washed', 'apparel', 'Relaxed semi-oversized fit T-shirt', 250000, 300000, false, 11,
   '/images/products/love-game-black-washed.webp',
   'Built for the moments after the final point. With a premium washed finish and a relaxed semi-oversized fit, the Love Game Tee is inspired by the connections, memories, and lifestyle that grow through the game we love — made for coffee runs after practice, post-match hangouts, weekend rallies, and everything in between. On court, it''s a score. Off court, it''s a lifestyle.', null,
   'Relaxed Fit – Semi-Oversized', 'Washed Black', array['S','M','L','XL','XXL']),
  ('rally-in-paradise-white', 'SOS-APP-012', 'Rally in Paradise — White', 'apparel', 'Regular fit T-shirt', 200000, 250000, true, 12,
   '/images/products/rally-in-paradise-white.webp',
   'A regular-fit white tee from the Rally in Paradise series — palm trees, sunshine, and tennis that feels like a holiday.', null,
   'Regular Fit', 'White', array['S','M','L','XL','XXL']),
  ('destination-series-bali-black', 'SOS-APP-013', 'Destination Series 01: Bali — Black', 'apparel', 'Oversized fit T-shirt', 220000, 280000, true, 13,
   '/images/products/destination-series-bali-black.webp',
   'The Destination Series 01: Bali tee in black — an oversized fit with the Slay Club flower on the back.', null,
   'Oversized Fit', 'Black', array['S','M','L','XL','XXL']),
  ('beyond-the-court-black', 'SOS-APP-014', 'Beyond the Court — Black', 'apparel', 'Relaxed semi-oversized fit T-shirt', 200000, 280000, false, 14,
   '/images/products/beyond-the-court-black.webp',
   'A relaxed semi-oversized black tee for everything beyond the court — practice, brunch, and the ride home.', null,
   'Relaxed Fit – Semi-Oversized', 'Black', array['S','M','L','XL','XXL']),
  ('slay-socks-white', 'SOS-SCK-001', 'Slay Socks — White', 'socks', 'Crew socks · 100% cotton', 80000, null, false, 20,
   '/images/products/slay-socks-white.webp',
   'Comfy crew socks in 100% cotton. The finishing touch for a clean, all-white tennis look.', '100% cotton',
   null, 'White', array['All Size']),
  ('pin-destination-series-lime', 'SOS-PIN-001', 'Destination Series — Lime', 'pin', 'Collectible enamel pin', 70000, null, false, 30,
   '/images/products/pin-destination-series-lime.webp',
   'A collectible enamel pin from the Destination Series. Clip it on your bag, cap, or jacket.', null, null, null, array[]::text[]),
  ('pin-destination-series-navy', 'SOS-PIN-002', 'Destination Series — Navy', 'pin', 'Collectible enamel pin', 70000, null, false, 31,
   '/images/products/pin-destination-series-navy.webp',
   'A collectible enamel pin from the Destination Series in navy. Clip it on your bag, cap, or jacket.', null, null, null, array[]::text[]),
  ('pin-love-game', 'SOS-PIN-003', 'Love Game Series', 'pin', 'Collectible enamel pin', 70000, null, false, 32,
   '/images/products/pin-love-game.webp',
   'A collectible enamel pin from the Love Game series.', null, null, null, array[]::text[]),
  ('pin-beyond-the-court', 'SOS-PIN-004', 'Beyond the Court', 'pin', 'Collectible enamel pin', 70000, null, true, 33,
   '/images/products/pin-beyond-the-court.webp',
   'A collectible enamel pin from the Beyond the Court series.', null, null, null, array[]::text[]),
  ('pin-rally-in-paradise', 'SOS-PIN-005', 'Rally in Paradise', 'pin', 'Collectible enamel pin', 70000, null, false, 34,
   '/images/products/pin-rally-in-paradise.webp',
   'A collectible enamel pin from the Rally in Paradise series.', null, null, null, array[]::text[]),
  ('mini-slayers-figure', 'SOS-FIG-001', 'Mini Slayers Figure', 'figure', 'Collectible mini figure', 220000, null, true, 40,
   '/images/products/mini-slayers-figure.webp',
   'Mini collectible figures of the Slayers. A playful keepsake for your desk, shelf, or racket bag.', null, null, null, array[]::text[])
),
ins as (
  insert into products (slug, sku, name, category, subtitle, price, compare_at_price, description, material, status, is_featured, show_size_guide, sort_order)
  select slug, sku, name, category::product_category, subtitle, price, compare_at, description, material, 'active', featured, category = 'apparel', sort
    from p
  on conflict (slug) do nothing
  returning id, slug
),
img as (
  insert into product_images (product_id, path, alt, sort_order)
  select ins.id, p.image, p.name, 0 from ins join p using (slug)
)
insert into product_variants (product_id, sku, options, stock)
select ins.id,
       p.sku || coalesce('-' || nullif(upper(replace(s.size, ' ', '')), ''), ''),
       jsonb_strip_nulls(jsonb_build_object('fit', p.fit, 'color', p.color, 'size', s.size)),
       10
  from ins join p using (slug)
  left join lateral unnest(case when cardinality(p.sizes) = 0 then array[null::text] else p.sizes end) as s(size) on true;
