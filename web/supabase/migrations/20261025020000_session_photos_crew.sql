-- Foto sesi (album Google Drive + 1 thumbnail) & peran crew member per sesi (host / fotografer).

alter table sessions
  add column photo_album_url  text,           -- link folder Google Drive (bisa diakses siapa saja yang punya link)
  add column photo_cover_path text,           -- URL thumbnail di Storage (rasio 16:9)
  add column photo_count      integer check (photo_count is null or photo_count >= 0),
  add column photos_posted_at timestamptz;    -- kapan link album pertama kali disimpan

-- Member bisa jadi host atau fotografer sesi. Hanya host yang dapat akses Panel Host.
alter table session_hosts
  add column role text not null default 'host' check (role in ('host', 'photographer'));

create or replace function is_session_host(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from session_hosts h
    join sessions s on s.id = h.session_id
    where h.session_id = p_session
      and h.member_id = auth.uid()
      and h.role = 'host'
      and s.ended_at is null
      and s.status in ('draft', 'published')
  );
$$;
