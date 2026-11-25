-- DRAFT — BELUM DIJALANKAN. Jangan apply ke production tanpa persetujuan.
-- Rencana sinkron data app SOSLAY (v2). Di v1 data ini disimpan di HP saja.
-- Video TIDAK PERNAH diunggah: server hanya menyimpan tautan (id aset lokal) ke activity.

create table if not exists public.app_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null check (kind in ('mabar', 'sparring', 'match')),
  venue text not null default '',
  starts_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.app_matches (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.app_activities(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  court text not null default '',
  team_a text not null,
  team_b text not null,
  format jsonb not null,               -- { sets: 1|3, games: 4|6, noAd: bool }
  first_server text not null check (first_server in ('A', 'B')),
  points text[] not null default '{}', -- urutan poin 'A'/'B'; skor dihitung ulang di app
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.app_video_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_asset_id text not null,       -- id aset di galeri HP, bukan file
  activity_id uuid references public.app_activities(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null, -- activity Social Slay
  duration_sec int not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_id, device_asset_id)
);

alter table public.app_activities enable row level security;
alter table public.app_matches enable row level security;
alter table public.app_video_links enable row level security;

-- Hanya pemilik yang bisa melihat & mengubah datanya sendiri.
create policy "own activities" on public.app_activities for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own matches" on public.app_matches for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own video links" on public.app_video_links for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
