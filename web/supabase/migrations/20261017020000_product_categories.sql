-- Shop v2 (Figma 347:2044): section per kategori — T-Shirt (apparel), Socks, Enamel Pin, Custom Figure.
-- Nilai enum baru harus di-commit dulu sebelum dipakai → produk diisi di migrasi berikutnya.
alter type product_category add value if not exists 'socks';
alter type product_category add value if not exists 'pin';
alter type product_category add value if not exists 'figure';

-- Baris kecil di bawah nama produk pada kartu ("Oversized fit T-shirt", "Collectible enamel pin").
alter table products add column if not exists subtitle text check (length(subtitle) <= 80);
