-- Foto kartu Shop (mockup lime, Figma Card/Merch) bisa beda dari galeri halaman produk
-- (Figma Product Detail: foto model + 4 foto produk). null → kartu memakai foto galeri pertama.
alter table products add column if not exists card_image text check (card_image is null or card_image ~ '^(/images/|https://)');

update products set card_image = '/images/products/love-game-black-washed.webp'
 where slug = 'love-game-black-washed' and card_image is null;

delete from product_images
 where product_id = (select id from products where slug = 'love-game-black-washed')
   and path = '/images/products/love-game-black-washed.webp';

insert into product_images (product_id, path, alt, sort_order)
select p.id, v.path, v.alt, v.sort
  from products p,
       (values
         ('/images/products/love-game-model.webp', 'Model wearing the Love Game washed black tee', 0),
         ('/images/products/love-game-front.webp', 'Love Game tee, front', 1),
         ('/images/products/love-game-back.webp', 'Love Game tee, back print', 2),
         ('/images/products/love-game-flat.webp', 'Love Game tee, flat lay', 3),
         ('/images/products/love-game-detail.webp', 'Love Game tee, back detail', 4)
       ) as v(path, alt, sort)
 where p.slug = 'love-game-black-washed'
   and not exists (select 1 from product_images i where i.product_id = p.id and i.path = v.path);
