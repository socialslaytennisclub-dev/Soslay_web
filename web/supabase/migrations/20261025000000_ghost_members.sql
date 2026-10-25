-- Ghost member: peserta Kuyy yang belum daftar member Soslay. Disimpan sekali, dikenali lagi di
-- aktivitas berikutnya lewat Kuy ID miliknya sendiri (username Kuyy), lalu email, lalu telepon —
-- jadi riwayat aktivitasnya terkumpul walau belum punya akun. Saat dia akhirnya daftar
-- (profil dibuat), ghost-nya otomatis diklaim: semua sesi yang pernah diikuti pindah ke akunnya
-- dan Slay Point kehadiran diberikan lewat trigger booking yang sudah ada.

create table ghost_members (
  id            uuid primary key default gen_random_uuid(),
  kuy_id        citext unique,               -- username Kuyy milik peserta sendiri (bukan pembeli tiket)
  full_name     text not null,
  email         citext,
  phone         text,                         -- tanpa +62 / 0 di depan
  tennis_level  tennis_level,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  claimed_by    uuid references profiles(id) on delete set null,
  claimed_at    timestamptz
);
create index ghost_members_email_idx on ghost_members (email) where claimed_by is null;
create index ghost_members_phone_idx on ghost_members (phone) where claimed_by is null;

alter table session_participants add column ghost_id uuid references ghost_members(id) on delete set null;
create index session_participants_ghost_idx on session_participants (ghost_id) where ghost_id is not null;

alter table ghost_members enable row level security;
create policy "admin read ghosts"  on ghost_members for select using ((select has_permission('activities')) or (select has_permission('members')));
create policy "admin write ghosts" on ghost_members for all
  using ((select has_permission('activities', 'edit'))) with check ((select has_permission('activities', 'edit')));

/** Nomor dalam format pembanding: hanya angka, tanpa 62 / 0 di depan. */
create function normalize_phone(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(62|0)', ''), '');
$$;

-- Profil member baru → klaim ghost yang cocok (Kuy ID, lalu email, lalu telepon).
create function claim_ghost_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ghost uuid;
begin
  select g.id into ghost
  from ghost_members g
  where g.claimed_by is null
    and (
      (new.kuy_id is not null and g.kuy_id = new.kuy_id)
      or g.email = new.email
      or (normalize_phone(new.phone) is not null and g.phone = normalize_phone(new.phone))
    )
  order by (new.kuy_id is not null and g.kuy_id = new.kuy_id) desc, (g.email = new.email) desc, g.last_seen_at desc
  limit 1;

  if ghost is null then
    return new;
  end if;

  update ghost_members set claimed_by = new.id, claimed_at = now() where id = ghost;
  -- member_id terisi → session_participant_sync membuat booking (+ status hadir → poin).
  update session_participants set member_id = new.id where ghost_id = ghost and member_id is null;
  return new;
end $$;
create trigger profiles_claim_ghost after insert on profiles for each row execute function claim_ghost_member();

revoke all on function claim_ghost_member() from public, anon, authenticated;
