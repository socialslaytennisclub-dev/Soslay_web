-- Samakan SKU varian dengan format admin (SKU-<slug pilihan>), mis. "All Size" → "-ALL-SIZE".
update product_variants set sku = 'SOS-SCK-001-ALL-SIZE' where sku = 'SOS-SCK-001-ALLSIZE';
-- Produk tanpa pilihan (pin, figure): admin memakai akhiran -DEFAULT.
update product_variants v set sku = p.sku || '-DEFAULT'
  from products p
 where v.product_id = p.id and v.options = '{}' and v.sku = p.sku and p.category in ('pin', 'figure');
