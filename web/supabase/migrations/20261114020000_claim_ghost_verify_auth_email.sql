-- Klaim ghost lewat email mempercayai email LOGIN (auth.users), bukan profiles.email yang bisa ditulis.
-- auth.users.email hanya berubah lewat Supabase Auth (member: harus konfirmasi email baru; server: service
-- role). Jadi walau ada jalur lain yang mengubah profiles.email, ghost hanya diklaim bila email itu memang
-- email login akun ini. Kunci profiles_protect_columns (20261114010000) tetap ada sebagai lapis kedua.
-- Alur sah ("Wrong email? Change it", admin "Ganti email login") mengganti email Auth dulu, baru profil.
create or replace function claim_ghost_member_by_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ghost uuid;
begin
  if not exists (select 1 from auth.users u where u.id = new.id and lower(u.email) = lower(new.email::text)) then
    return new;
  end if;

  select g.id into ghost
  from ghost_members g
  where g.claimed_by is null and g.email = new.email
  order by g.last_seen_at desc
  limit 1;

  if ghost is null then
    return new;
  end if;

  update ghost_members set claimed_by = new.id, claimed_at = now() where id = ghost;
  -- member_id terisi → session_participant_sync membuat booking (+ status hadir → poin).
  update session_participants set member_id = new.id where ghost_id = ghost and member_id is null;
  return new;
end $$;
