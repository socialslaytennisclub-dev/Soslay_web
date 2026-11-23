-- Order merch tamu (Admin Orders · "Input order lama", channel 'manual', tanpa member_id) → otomatis ditautkan
-- ke akun begitu pembelinya menjadi member dengan nomor HP yang sama — seperti tamu activity
-- (claim_ghost_member) & peserta trip (claim_trip_bookings_for_profile). Riwayat pesanan & Total spent member
-- jadi lengkap termasuk pembelian sebelum ia daftar.
--
-- · Hanya order 'manual': checkout website selalu atas nama member yang login.
-- · Hanya bila nomor HP itu milik satu profil saja (sole_profile_for_phone) — nomor dipakai bersama → ambigu
--   (nomor saat daftar tidak diverifikasi), ditautkan admin.
-- · Hanya saat profil dibuat (nomor HP wajib saat daftar), sama dengan aturan tamu activity & trip. Ganti nomor
--   HP di profil sesudahnya TIDAK mengklaim order: nomor tidak diverifikasi, jadi member tidak bisa mengambil
--   riwayat orang lain dengan memasukkan nomornya. Kasus itu ditautkan admin (konfirmasi saat input order).
-- · Mengisi member_id tidak memicu trigger poin / Keuangan / stok (hanya status, payment_status, total):
--   Slay Point tetap tidak diberikan untuk order lama dan catatan Keuangan tidak berubah.

-- Cari profil & order tamu per nomor HP ternormalisasi (trigger daftar & impor) lewat index, bukan scan tabel.
create index profiles_phone_norm_idx on profiles (normalize_phone(phone));
create index orders_guest_phone_idx on orders (normalize_phone(recipient_phone)) where member_id is null and channel = 'manual';

/** Profil pemilik nomor HP ini — null bila tidak ada atau nomornya dipakai lebih dari satu profil (ambigu). */
create function sole_profile_for_phone(p_phone text) returns uuid
language sql stable security definer set search_path = public as $$
  select (array_agg(id))[1] from profiles
  where normalize_phone(phone) = normalize_phone(p_phone)
  having count(*) = 1;
$$;
revoke all on function sole_profile_for_phone(text) from public, anon, authenticated;

create function claim_guest_orders_for_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- After insert: profil baru sudah terhitung, jadi pemilik tunggal nomor ini harus profil ini sendiri.
  if sole_profile_for_phone(new.phone) is distinct from new.id then
    return new;
  end if;
  update orders set member_id = new.id
  where member_id is null and channel = 'manual' and normalize_phone(recipient_phone) = normalize_phone(new.phone);
  return new;
end $$;

create trigger profiles_claim_guest_orders after insert on profiles
  for each row execute function claim_guest_orders_for_profile();

revoke all on function claim_guest_orders_for_profile() from public, anon, authenticated;

-- Backfill: order tamu yang pembelinya SUDAH menjadi member (mis. daftar sebelum trigger ini ada). Nomor yang
-- dipakai lebih dari satu profil tidak ditautkan otomatis (ambigu) — tetap bisa ditautkan admin.
update orders set member_id = sole_profile_for_phone(recipient_phone)
where member_id is null and channel = 'manual' and sole_profile_for_phone(recipient_phone) is not null;
