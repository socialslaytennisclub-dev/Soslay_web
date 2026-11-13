-- Galeri foto sesi (admin Konten & Galeri → Galeri foto):
-- • setiap foto dikaitkan ke satu activity (album = activity, dibuat otomatis & langsung tayang),
-- • tampil di galeri venue tempat activity itu berlangsung,
-- • caption opsional, dan member yang ikut main di activity itu bisa di-tag (avatar di kartu foto).
-- photos.path menyimpan URL publik Storage (bucket "gallery-photos").

alter table photos add constraint photos_caption_len check (caption is null or length(caption) <= 200);

-- Tag hanya untuk member yang ikut activity foto tersebut (terdaftar / hadir).
create function photo_tag_must_be_participant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from photos p
    join photo_albums a on a.id = p.album_id
    join bookings b on b.session_id = a.session_id and b.member_id = new.member_id
    where p.id = new.photo_id and b.status in ('registered', 'attended')
  ) then
    raise exception 'Member ini tidak ikut main di activity foto tersebut';
  end if;
  return new;
end $$;

create trigger photo_tags_participant before insert or update on photo_tags
  for each row execute function photo_tag_must_be_participant();

-- Simpan foto galeri: p_photo null → foto baru di album activity p_session; selain itu ubah caption & tag.
create function save_gallery_photo(p_photo uuid, p_session uuid, p_path text, p_caption text, p_members uuid[])
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_photo uuid := p_photo;
  v_album uuid;
  v_session sessions%rowtype;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if not has_permission('content', 'edit') then
    raise exception 'Butuh izin edit Konten & Galeri';
  end if;
  if length(v_caption) > 200 then
    raise exception 'Caption maksimal 200 karakter';
  end if;

  if v_photo is null then
    select * into v_session from sessions where id = p_session;
    if not found then raise exception 'Activity tidak ditemukan'; end if;
    if v_session.status not in ('published', 'completed') or v_session.starts_at > now() then
      raise exception 'Foto hanya bisa diunggah untuk activity yang sudah berlangsung';
    end if;
    if coalesce(btrim(p_path), '') = '' then raise exception 'Foto belum diunggah'; end if;

    insert into photo_albums (session_id, venue_id, title, taken_on, status, published_at)
    values (v_session.id, v_session.venue_id, v_session.title, (v_session.starts_at at time zone 'Asia/Jakarta')::date, 'published', now())
    on conflict (session_id) do update set status = 'published', published_at = coalesce(photo_albums.published_at, now())
    returning id into v_album;

    insert into photos (album_id, path, caption, uploaded_by)
    values (v_album, p_path, v_caption, auth.uid())
    returning id into v_photo;

    update photo_albums set cover_photo = v_photo where id = v_album and cover_photo is null;
  else
    update photos set caption = v_caption where id = v_photo;
    if not found then raise exception 'Foto tidak ditemukan'; end if;
  end if;

  delete from photo_tags where photo_id = v_photo and member_id <> all (coalesce(p_members, '{}'));
  insert into photo_tags (photo_id, member_id)
  select v_photo, m from unnest(coalesce(p_members, '{}')) m
  on conflict do nothing;

  return v_photo;
end $$;

-- Galeri publik per venue (website): foto album yang tayang + member ter-tag (nama depan & Instagram saja).
create function venue_gallery(p_venue_slug text, p_limit int default 60)
returns table (id uuid, path text, caption text, taken_on date, session_title text, members jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.path, p.caption, a.taken_on, coalesce(s.title, a.title),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'first_name', split_part(btrim(pr.full_name), ' ', 1), 'instagram', pr.instagram) order by pr.full_name)
      from photo_tags t join profiles pr on pr.id = t.member_id
      where t.photo_id = p.id
    ), '[]'::jsonb)
  from photos p
  join photo_albums a on a.id = p.album_id and a.status = 'published'
  join venues v on v.id = a.venue_id and v.slug = p_venue_slug
  left join sessions s on s.id = a.session_id
  order by a.taken_on desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
