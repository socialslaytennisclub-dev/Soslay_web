-- Warna court venue (admin Venues › Info venue) — tampil di kartu info hero Venue detail & Participant Guide
-- sebagai "<warna> court", mis. "Terracotta-walled court".
alter table venues add column court_color text check (length(court_color) <= 60);
update venues set court_color = 'Terracotta-walled' where slug = 'common-grounds-menteng' and court_color is null;
update venues set court_color = 'Synthetic-grass' where slug = 'rana-grounds' and court_color is null;
