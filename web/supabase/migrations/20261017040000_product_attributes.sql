-- Fit & warna = atribut tetap per produk (Figma Product Detail: "Select Fit · Relaxed Fit",
-- "Select Color · Washed Black"); varian cukup ukuran → form admin (satu jenis pilihan) tetap cocok.
alter table products add column if not exists attributes jsonb not null default '{}'
  check (jsonb_typeof(attributes) = 'object');

-- Pindahkan fit/color dari varian produk Shop v2 ke atribut produk.
update products p
   set attributes = jsonb_strip_nulls(jsonb_build_object('fit', v.options ->> 'fit', 'color', v.options ->> 'color'))
  from (select distinct on (product_id) product_id, options from product_variants order by product_id, sku) v
 where v.product_id = p.id and (v.options ? 'fit' or v.options ? 'color');

update product_variants
   set options = options - 'fit' - 'color'
 where options ? 'fit' or options ? 'color';
