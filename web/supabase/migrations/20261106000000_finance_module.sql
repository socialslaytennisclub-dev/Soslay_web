-- Modul izin baru "Keuangan" (ADM-18). File terpisah: nilai enum baru belum boleh dipakai di
-- transaksi yang sama dengan ALTER TYPE … ADD VALUE.
--   finance = edit  → akses penuh (Super Admin)
--   finance = view  → Pencatat keuangan: catat & lihat transaksi, tanpa laporan/pengaturan
alter type admin_module add value if not exists 'finance';
