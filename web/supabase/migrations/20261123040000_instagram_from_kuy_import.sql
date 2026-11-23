-- Instagram dari file peserta Kuyy (kolom "Instagram", tersimpan di session_participants.instagram) → otomatis
-- mengisi Instagram di profil member, dicocokkan lewat nomor HP (diminta 23 Nov 2026).
--
-- · Hanya mengisi profil yang Instagram-nya masih KOSONG — isian member sendiri / admin tidak pernah ditimpa.
-- · Nomor HP dicocokkan dengan normalize_phone (0812… / +62 812… / 812… sama) lewat sole_profile_for_phone
--   (migrasi order tamu): nomor yang dipakai lebih dari satu profil dilewati (tidak jelas milik siapa).
-- · Format: "@nama", "nama", atau link instagram.com/nama → "nama"; isian yang bukan username valid dilewati.
-- · Saat impor (baris peserta baru / Instagram atau nomor HP berubah) → profil member dengan nomor itu diisi.
-- · Saat daftar member baru → diisi dari impor terbaru dengan nomor HP yang sama (tamu yang lalu jadi member).
-- · Ketiga jalur (impor, daftar, data lama) memakai satu aturan: fill_profile_instagram.
-- · Data yang sudah ada diisi sekali di akhir migrasi ini.

/** Username Instagram dari isian bebas ("@nama", "nama", "instagram.com/nama/") — null bila bukan username valid. */
create function instagram_handle(p text) returns text language sql immutable as $$
  select case when h ~ '^[a-z0-9._]{1,30}$' then h end
  from (
    select lower(regexp_replace(regexp_replace(regexp_replace(trim(coalesce(p, '')),
      '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', '', 'i'), '[/?#].*$', ''), '^@+', '')) as h
  ) x;
$$;

-- Impor Kuyy terbaru per nomor HP (dipakai saat daftar member) lewat index, bukan scan semua peserta.
create index session_participants_phone_norm_idx on session_participants (normalize_phone(phone)) where instagram is not null;

/** Isi Instagram profil kosong pemilik nomor HP ini (hanya bila nomornya milik tepat satu profil). */
create function fill_profile_instagram(p_phone text, p_instagram text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ig text := instagram_handle(p_instagram);
begin
  if v_ig is null then return; end if;
  update profiles set instagram = v_ig
  where id = sole_profile_for_phone(p_phone) and coalesce(instagram::text, '') = '';
end $$;
revoke all on function fill_profile_instagram(text, text) from public, anon, authenticated;

create function session_participant_fill_instagram() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fill_profile_instagram(new.phone, new.instagram);
  return new;
end $$;
revoke all on function session_participant_fill_instagram() from public, anon, authenticated;

-- Impor ulang menulis ulang kolom yang sama → hanya bila Instagram / nomor HP benar-benar berubah.
create trigger session_participants_fill_instagram after insert on session_participants
  for each row when (new.instagram is not null and new.phone is not null)
  execute function session_participant_fill_instagram();
create trigger session_participants_fill_instagram_update after update of instagram, phone on session_participants
  for each row when (new.instagram is not null and new.phone is not null
    and (old.instagram is distinct from new.instagram or old.phone is distinct from new.phone))
  execute function session_participant_fill_instagram();

/** Daftar member baru → Instagram dari impor Kuyy terbaru dengan nomor HP yang sama (bila profil masih kosong). */
create function profile_instagram_from_imports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fill_profile_instagram(new.phone, (
    select sp.instagram from session_participants sp
    where sp.instagram is not null and normalize_phone(sp.phone) = normalize_phone(new.phone)
      and instagram_handle(sp.instagram) is not null
    order by sp.imported_at desc nulls last
    limit 1));
  return new;
end $$;
revoke all on function profile_instagram_from_imports() from public, anon, authenticated;

create trigger profiles_instagram_from_imports after insert on profiles
  for each row when (new.phone is not null and coalesce(new.instagram::text, '') = '')
  execute function profile_instagram_from_imports();

-- Data yang sudah ada: impor terbaru per nomor HP → profil kosong pemiliknya (aturan sama, fill_profile_instagram).
select fill_profile_instagram(phone, instagram)
from (
  select distinct on (normalize_phone(phone)) phone, instagram
  from session_participants
  where instagram is not null and normalize_phone(phone) is not null and instagram_handle(instagram) is not null
  order by normalize_phone(phone), imported_at desc nulls last
) latest;
