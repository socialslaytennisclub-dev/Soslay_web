-- Form venue admin (Figma 928:3545): zona waktu, permukaan, patokan & fasilitas.
-- Kota sekarang bisa kota mana pun di Indonesia (dropdown admin); "Jakarta" & "Bali" tetap
-- dipakai website sebagai wilayah.
alter table venues
  add column timezone   text not null default 'Asia/Jakarta'
    check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  add column surface    text check (surface in ('Hard Court', 'Grass Court', 'Clay Court', 'Synthetic Grass Court')),
  add column landmark   text,
  add column facilities text[] not null default '{}';

update venues set timezone = 'Asia/Makassar' where city = 'Bali';

-- Kota lama berupa wilayah → kota default: Jakarta → Jakarta Pusat, Bali → Denpasar (Kota di
-- Bali). Website tetap memetakannya ke wilayah Jakarta / Bali (lib/venue-options websiteRegion).
update venues set city = 'Jakarta Pusat' where city = 'Jakarta';
update venues set city = 'Denpasar' where city = 'Bali';
