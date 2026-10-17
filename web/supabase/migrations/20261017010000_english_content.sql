-- Website v2 (Figma 423:2482) memakai bahasa Inggris. Terjemahkan konten seed awal di database.
-- Setiap UPDATE hanya mengenai teks seed yang belum pernah diubah admin (dicocokkan dengan teks lamanya),
-- jadi isi yang sudah diedit tim tidak tertimpa. Draft ikut diganti hanya bila sama dengan versi published.

create function pg_temp.translate_section(p_key text, p_old_description text, p_new jsonb) returns void language sql as $$
  update content_sections
     set draft = case when draft = published then published || p_new else draft end,
         published = published || p_new
   where page = 'home' and key = p_key and published ->> 'description' = p_old_description;
$$;

select pg_temp.translate_section('hero',
  'Bukan sekadar komunitas bermain tenis. Tapi sebuah komunitas untuk bermain, terhubung, dan menikmati momen bersama orang-orang yang tepat',
  '{"description": "Not just a tennis community. A community to play, connect, and enjoy moments with the right people.", "cta": {"href": "/daftar", "label": "Join the Community"}}');

select pg_temp.translate_section('activities',
  'Dari mabar santai sampai match day, selalu ada cara untuk ikut bermain, bertemu orang baru, dan menikmati serunya tenis bersama komunitas.',
  '{"title": "More Than Just a Match!", "description": "From casual hit-arounds to match day, there''s always a way to play, meet new people, and enjoy tennis with the community.", "cta": {"href": "https://kuy.id/soslay", "label": "Book a Session on Kuyy"}}');

update content_sections set
  draft = case when draft = published then published || '{"title": "Stats"}' else draft end,
  published = published || '{"title": "Stats"}'
 where page = 'home' and key = 'stats' and published ->> 'title' = 'Statistik';

select pg_temp.translate_section('venues',
  'Kami memilih venue dengan suasana, fasilitas, dan pengalaman yang layak untuk dinikmati. Dari Jakarta sampai Bali, temukan tempat bermain yang bikin setiap sesi terasa lebih spesial.',
  '{"title": "We Only Play Where It Looks Good.", "description": "We choose venues with the atmosphere, facilities, and experience worth enjoying. From Jakarta to Bali, find courts that make every session feel a little more special.", "cta": {"href": "/venue", "label": "See All Courts"}}');

select pg_temp.translate_section('community',
  'Temukan komunitas yang membuat setiap permainan terasa lebih berarti. Kenalan, bermain, berbagi momen, dan tumbuh bersama orang-orang yang tepat.',
  '{"description": "Find a community that makes every game more meaningful. Meet new people, play, share moments, and grow together with the right crowd.", "cta": {"href": "/daftar", "label": "Join the Community"}}');

select pg_temp.translate_section('shop',
  'Koleksi yang terinspirasi dari permainan, perjalanan, dan orang-orang yang membuat setiap momen di SOSLAY terasa spesial.',
  '{"description": "A collection inspired by the game, the journey, and the people who make every moment at SOSLAY feel special.", "cta": {"href": "/shop", "label": "View Collection"}}');

select pg_temp.translate_section('instagram',
  'Lihat keseruan SOSLAY dari dekat. Dari rally seru sampai momen di luar lapangan, semuanya ada di sini.',
  '{"description": "Get a closer look at SOSLAY. From epic rallies to moments off the court, it''s all here."}');

select pg_temp.translate_section('promo',
  'Koleksi baru terinspirasi dari Bali dan Jakarta. Stok terbatas.',
  '{"title": "Destination Series — drops 10 October", "description": "A new collection inspired by Bali and Jakarta. Limited stock.", "cta": {"href": "/shop", "label": "View collection"}}');

-- Testimoni seed
update testimonials t set quote = v.new
  from (values
    ('Niatnya cuma satu sesi. Eh, malah jadi rutin ketemu dan main bareng.', 'I only meant to come for one session. Somehow it turned into a regular thing.'),
    ('Datang untuk main, tapi selalu ada alasan untuk celebrate bareng.', 'Come to play, but there''s always a reason to celebrate together.'),
    ('Yang aku suka dari Soslay, semuanya terasa effortless. Datang, main, ketemu orang baru, dan have a good time.', 'What I love about Soslay is that everything feels effortless. Show up, play, meet new people, and have a good time.'),
    ('Yang bikin ketagihan bukan cuma permainannya, tapi orang-orang yang kamu temui di sepanjang jalan.', 'What keeps you hooked isn''t just the game, it''s the people you meet along the way.'),
    ('Main bareng, ketawa bareng, repeat lagi minggu depan.', 'Play together, laugh together, repeat next week.'),
    ('Pertama kali ikut Beginner Coaching, coach-nya sabar banget. Sekarang udah berani ikut mabar.', 'My first Beginner Coaching session — the coach was so patient. Now I''m confident enough to join mabar.'),
    ('Tennis Escape ke Bali kemarin jadi trip terbaik tahun ini.', 'The Tennis Escape to Bali was the best trip of the year.')
  ) as v(old, new)
 where t.quote = v.old;

-- Venue seed: tagline, deskripsi, wilayah
update venues ve set tagline = v.tagline, description = v.description, area = coalesce(ve.area, v.area)
  from (values
    ('ayana-midplaza-jakarta', 'Lapangan indoor di jantung Sudirman — tetap main walau hujan turun.',
      'An indoor court in the heart of Sudirman — keep playing even when it rains.',
      'An indoor hard court with even lighting. A favorite for early Weekly MABAR sessions before the Jakarta traffic kicks in.', 'Central Jakarta'),
    ('raffles-hotel-jakarta', 'Rooftop court dengan pemandangan kota Kuningan.',
      'A rooftop court overlooking the Kuningan skyline.',
      'Play high above the city with the Jakarta sky as your backdrop. Perfect for afternoon coaching and sunset rallies.', 'South Jakarta'),
    ('common-grounds-menteng', 'Tembok oranye ikonik, rindang, dan selalu fotogenik.',
      'Iconic terracotta walls, leafy shade, and always photogenic.',
      'A hidden tennis courtyard in the heart of Menteng. Check upcoming sessions, the participant guide, and highlights from past sessions — all on one page.', 'Central Jakarta'),
    ('maison-playcourt', 'Clay court premium dengan nuansa resort di tengah kota.',
      'A premium clay court with resort vibes in the middle of the city.',
      'A soft clay surface and a warm, inviting venue. Home of our Tennis Match Day.', null),
    ('kula-mani-tennis-village', 'Tennis village di Bali yang dikelilingi pohon kelapa.',
      'A tennis village in Bali surrounded by coconut trees.',
      'Blue courts and cool Bali mornings. Our basecamp for Tennis Escape and Sunset Rally sessions.', null),
    ('swan-paradise-pramana', 'Grass court tropis — main tenis rasa liburan.',
      'A tropical grass court — tennis that feels like a holiday.',
      'A grass court in the middle of a tropical garden. Sessions usually end with brunch together.', null)
  ) as v(slug, old_tagline, tagline, description, area)
 where ve.slug = v.slug and ve.tagline = v.old_tagline;
