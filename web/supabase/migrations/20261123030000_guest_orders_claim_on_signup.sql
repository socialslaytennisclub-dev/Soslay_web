-- Order merch tamu (Admin Orders · "Input order lama", channel 'manual', tanpa member_id) → otomatis ditautkan
-- ke akun begitu pembelinya menjadi member dengan nomor HP yang sama — seperti tamu activity
-- (claim_ghost_member) & peserta trip (claim_trip_bookings_for_profile). Riwayat pesanan & Total spent member
-- jadi lengkap termasuk pembelian sebelum ia daftar.
--
-- · Hanya order 'manual': checkout website selalu atas nama member yang login.
-- · Hanya bila nomor HP itu milik satu profil saja (nomor dipakai bersama → ambigu, ditautkan admin).
-- · Hanya saat profil dibuat (nomor HP wajib saat daftar), sama dengan aturan tamu activity & trip. Ganti nomor
--   HP di profil sesudahnya TIDAK mengklaim order: nomor tidak diverifikasi, jadi member tidak bisa mengambil
--   riwayat orang lain dengan memasukkan nomornya. Kasus itu ditautkan admin (konfirmasi saat input order).
-- · Mengisi member_id tidak memicu trigger poin / Keuangan / stok (hanya status, payment_status, total):
--   Slay Point tetap tidak diberikan untuk order lama dan catatan Keuangan tidak berubah.

create function claim_guest_orders_for_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := normalize_phone(new.phone);
begin
  -- Nomor yang juga dipakai profil lain → ambigu (nomor saat daftar tidak diverifikasi): tidak ditautkan otomatis,
  -- sama dengan backfill di bawah; admin tetap bisa menautkan manual.
  if v_phone is null or exists (select 1 from profiles where id <> new.id and normalize_phone(phone) = v_phone) then
    return new;
  end if;
  update orders set member_id = new.id
  where member_id is null and channel = 'manual' and normalize_phone(recipient_phone) = v_phone;
  return new;
end $$;

create trigger profiles_claim_guest_orders after insert on profiles
  for each row execute function claim_guest_orders_for_profile();

revoke all on function claim_guest_orders_for_profile() from public, anon, authenticated;

-- Backfill: order tamu yang pembelinya SUDAH menjadi member (mis. daftar sebelum trigger ini ada). Nomor yang
-- dipakai lebih dari satu profil tidak ditautkan otomatis (ambigu) — tetap bisa ditautkan admin.
with owners as (
  select normalize_phone(phone) as phone, (array_agg(id))[1] as member_id
  from profiles
  where normalize_phone(phone) is not null
  group by normalize_phone(phone)
  having count(*) = 1
)
update orders o set member_id = owners.member_id
from owners
where o.member_id is null and o.channel = 'manual' and normalize_phone(o.recipient_phone) = owners.phone;
