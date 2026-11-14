-- Email profil diperbaiki (salah ketik saat daftar, mis. gmail.con → gmail.com; lewat "Wrong email? Change it"
-- atau tombol admin "Ganti email login") → calon member (ghost) dengan email yang benar ikut diklaim.
-- Sebelumnya klaim hanya berjalan saat profil dibuat (profiles_claim_ghost, after insert).
-- Sengaja HANYA lewat email: nomor HP bisa dipakai bersama (tiket pasangan dibelikan dari satu nomor) —
-- mencocokkan telepon / Kuy ID di sini bisa mengklaim ghost orang lain yang dibuat setelah member daftar.
create function claim_ghost_member_by_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ghost uuid;
begin
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

create trigger profiles_claim_ghost_on_email after update of email on profiles
  for each row when (old.email is distinct from new.email)
  execute function claim_ghost_member_by_email();

revoke all on function claim_ghost_member_by_email() from public, anon, authenticated;
