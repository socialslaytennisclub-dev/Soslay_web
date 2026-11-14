-- Member tidak boleh mengubah profiles.email sendiri (lewat REST / klien Supabase langsung).
-- Email profil = email login; trigger profiles_claim_ghost_on_email mempercayai kolom ini untuk mengklaim
-- ghost member. Tanpa kunci ini member bisa PATCH email-nya ke email ghost orang lain → riwayat, booking
-- & poin orang itu pindah ke akunnya, lalu email dikembalikan. Perubahan email yang sah lewat server
-- (service role: "Wrong email? Change it" & tombol admin "Ganti email login") — auth.uid() kosong di
-- sana sehingga tidak terkena kunci ini; admin members edit juga tetap boleh.
create or replace function profiles_protect_columns() returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id and not has_permission('members', 'edit') then
    if new.tier is distinct from old.tier
       or new.status is distinct from old.status
       or new.member_code is distinct from old.member_code
       or new.joined_at is distinct from old.joined_at then
      raise exception 'Kolom tier/status/member_code hanya bisa diubah admin';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email profil hanya bisa diubah lewat alur ganti email (bukan langsung)';
    end if;
  end if;
  return new;
end $$;
