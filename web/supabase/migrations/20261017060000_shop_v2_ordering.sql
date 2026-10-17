-- Shop v2: koleksi Figma tampil lebih dulu; kaos edisi lama tetap dijual di belakangnya dan
-- tidak lagi masuk Best Seller (bisa diubah lagi dari admin Products).
update products set sort_order = 15, is_featured = false where sku = 'SOS-APP-001' and sort_order = 0;
update products set sort_order = 16, is_featured = false where sku = 'SOS-APP-002' and sort_order in (0, 1);
