-- Testimoni teks atau video pendek 9:16 (Figma admin 09b–09f): link Instagram Reels / TikTok /
-- YouTube Shorts, atau file upload (Storage — aktif setelah bucket dikonfigurasi).
alter table testimonials
  add column if not exists kind text not null default 'text' check (kind in ('text', 'video')),
  add column if not exists video_url text check (video_url is null or video_url ~ '^(https://|/)'),
  add column if not exists video_platform text check (video_platform in ('instagram', 'tiktok', 'youtube', 'upload')),
  add column if not exists duration_seconds integer check (duration_seconds between 1 and 600),
  add column if not exists updated_at timestamptz not null default now();

alter table testimonials add constraint testimonials_video_has_url check (kind = 'text' or video_url is not null);
alter table testimonials add constraint testimonials_quote_length check (length(quote) <= 200);

create trigger testimonials_updated_at before update on testimonials for each row execute function set_updated_at();
