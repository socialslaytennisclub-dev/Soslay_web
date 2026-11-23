-- Instagram dari file peserta Kuyy (kolom "Instagram", tersimpan di session_participants.instagram) → otomatis
-- mengisi Instagram di profil member, dicocokkan lewat nomor HP (diminta 23 Nov 2026).
--
-- · Hanya mengisi profil yang Instagram-nya masih KOSONG — isian member sendiri / admin tidak pernah ditimpa.
-- · Nomor HP dicocokkan dengan normalize_phone (0812… / +62 812… / 812… sama). Nomor yang dipakai lebih dari satu
--   profil dilewati (tidak jelas milik siapa).
-- · Format: "@nama", "nama", atau link instagram.com/nama → "nama"; isian yang bukan username valid dilewati.
-- · Saat impor (baris peserta baru / Instagram atau nomor HP berubah) → profil member dengan nomor itu diisi.
-- · Saat daftar member baru → diisi dari impor terbaru dengan nomor HP yang sama (tamu yang lalu jadi member).
-- · Data yang sudah ada diisi sekali di akhir migrasi ini.

/** Username Instagram dari isian bebas ("@nama", "nama", "instagram.com/nama/") — null bila bukan username valid. */
create function instagram_handle(p text) returns text language sql immutable as $$
  select case when h ~ '^[a-z0-9._]{1,30}$' then h end
  from (
    select lower(regexp_replace(regexp_replace(regexp_replace(trim(coalesce(p, '')),
      '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', '', 'i'), '[/?#].*$', ''), '^@+', '')) as h
  ) x;
$$;

/** Isi Instagram profil kosong dengan nomor HP ini (hanya bila nomornya milik tepat satu profil). */
create function fill_profile_instagram(p_phone text, p_instagram text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := normalize_phone(p_phone);
  v_ig text := instagram_handle(p_instagram);
  v_profile uuid;
begin
  if v_phone is null or v_ig is null then return; end if;
  select (array_agg(id))[1] into v_profile from profiles where normalize_phone(phone) = v_phone having count(*) = 1;
  if v_profile is null then return; end if;
  update profiles set instagram = v_ig where id = v_profile and coalesce(instagram::text, '') = '';
end $$;
revoke all on function fill_profile_instagram(text, text) from public, anon, authenticated;

create function session_participant_fill_instagram() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fill_profile_instagram(new.phone, new.instagram);
  return new;
end $$;
revoke all on function session_participant_fill_instagram() from public, anon, authenticated;

create trigger session_participants_fill_instagram after insert or update of instagram, phone on session_participants
  for each row when (new.instagram is not null and new.phone is not null)
  execute function session_participant_fill_instagram();

/** Daftar member baru tanpa Instagram → ambil dari impor Kuyy terbaru dengan nomor HP yang sama. */
create function profile_instagram_from_imports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := normalize_phone(new.phone);
begin
  if coalesce(new.instagram::text, '') <> '' or v_phone is null then return new; end if;
  select instagram_handle(sp.instagram) into new.instagram
  from session_participants sp
  where sp.instagram is not null and normalize_phone(sp.phone) = v_phone and instagram_handle(sp.instagram) is not null
  order by sp.imported_at desc nulls last
  limit 1;
  return new;
end $$;
revoke all on function profile_instagram_from_imports() from public, anon, authenticated;

create trigger profiles_instagram_from_imports before insert on profiles
  for each row execute function profile_instagram_from_imports();

-- Data yang sudah ada: profil tanpa Instagram ← impor terbaru dengan nomor HP sama (nomor unik di profil saja).
with owners as (
  select normalize_phone(phone) as phone, (array_agg(id))[1] as profile_id
  from profiles
  where normalize_phone(phone) is not null and coalesce(instagram::text, '') = ''
  group by normalize_phone(phone)
),
unique_phones as (
  select normalize_phone(phone) as phone from profiles where normalize_phone(phone) is not null
  group by normalize_phone(phone) having count(*) = 1
),
latest as (
  select distinct on (normalize_phone(sp.phone)) normalize_phone(sp.phone) as phone, instagram_handle(sp.instagram) as ig
  from session_participants sp
  where sp.instagram is not null and normalize_phone(sp.phone) is not null and instagram_handle(sp.instagram) is not null
  order by normalize_phone(sp.phone), sp.imported_at desc nulls last
)
update profiles p set instagram = latest.ig
from owners
join unique_phones u on u.phone = owners.phone
join latest on latest.phone = owners.phone
where p.id = owners.profile_id;
