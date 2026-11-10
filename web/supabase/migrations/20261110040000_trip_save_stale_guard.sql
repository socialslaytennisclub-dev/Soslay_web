-- Simpan trip dari form basi ditolak (review 10 Nov). Dua tab / dua admin membuka trip yang sama: tab yang
-- dimuat lebih dulu tidak mengenal activity yang ditambahkan tab lain, sehingga simpannya melepas activity itu
-- dari trip (muncul sebagai activity tunggal, peserta paket keluar) dan menimpa info trip dengan data lama.
-- trips.form_version naik setiap kali trip disimpan lewat editor (save_trip). Editor mengirim versi yang ia
-- muat (p_info.form_version); berbeda dengan yang tersimpan → ditolak dengan hint trip_stale. Perubahan lain
-- pada baris trip (batal / arsip, edit sesi di halaman Edit activity) tidak dihitung — form tidak hilang
-- karena hal yang tidak ia timpa.

-- Sama dengan versi 20261110030000_trip_save_idempotent, kecuali pemeriksaan versi di atas.
alter table trips add column form_version integer not null default 1;

create or replace function save_trip(p_trip uuid, p_info jsonb, p_activities jsonb, p_rundown jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  r      trips := jsonb_populate_record(null::trips, p_info);
  v_trip uuid := p_trip;
  a      jsonb;
  s      sessions;
  v_id   uuid;
  keymap jsonb := '{}'::jsonb;
  keep   uuid[] := '{}';
  v_ver  integer;
begin
  if v_trip is null and r.create_key is not null then
    select id into v_trip from trips where create_key = r.create_key;
  end if;
  if v_trip is null then
    insert into trips (slug, title, description, area, starts_on, ends_on, cover_path, status, visibility, show_on_homepage,
                       show_rundown, price_normal, price_early_bird, early_bird_until, package_quota, min_dp, inclusions, created_by, create_key)
    values (r.slug, r.title, r.description, r.area, r.starts_on, r.ends_on, r.cover_path, r.status, r.visibility, r.show_on_homepage,
            r.show_rundown, r.price_normal, r.price_early_bird, r.early_bird_until, r.package_quota, r.min_dp, coalesce(r.inclusions, '{}'), auth.uid(), r.create_key)
    returning id into v_trip;
  else
    -- Form basi (trip sudah disimpan dari tab / admin lain sesudah form ini dimuat) → tolak, jangan menimpa
    -- atau melepas activity yang tidak dikenal form itu. p_info.form_version kosong = tanpa pemeriksaan
    -- (trip baru yang disimpan ulang lewat create_key).
    select form_version into v_ver from trips where id = v_trip for update;
    if found and (p_info ? 'form_version') and (p_info->>'form_version') is not null and v_ver <> (p_info->>'form_version')::integer then
      raise exception 'Trip ini sudah diubah di tab atau oleh admin lain — muat ulang halaman, lalu ulangi perubahan Anda.' using hint = 'trip_stale';
    end if;
    update trips set
      title = r.title, description = r.description, area = r.area, starts_on = r.starts_on, ends_on = r.ends_on,
      cover_path = r.cover_path, status = r.status, visibility = r.visibility, show_on_homepage = r.show_on_homepage,
      show_rundown = r.show_rundown, price_normal = r.price_normal, price_early_bird = r.price_early_bird,
      early_bird_until = r.early_bird_until, package_quota = r.package_quota, min_dp = r.min_dp, inclusions = coalesce(r.inclusions, '{}'),
      form_version = form_version + 1
    where id = v_trip;
    if not found then raise exception 'Trip tidak ditemukan.' using hint = 'trip_missing'; end if;
  end if;

  for a in select x from jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) x loop
    s := jsonb_populate_record(null::sessions, a);
    -- Activity baru yang sudah pernah tersimpan (key sama) → perbarui sesinya, jangan buat lagi.
    if s.id is null and a->>'key' is not null then
      v_id := null;
      select id into v_id from sessions where trip_key = a->>'key';
      s.id := v_id;
    end if;
    if s.id is not null then
      update sessions set
        title = s.title, venue_id = s.venue_id, starts_at = s.starts_at, ends_at = s.ends_at, capacity = s.capacity,
        sold_single = s.sold_single, price = s.price, single_quota = s.single_quota, kuy_booking_url = s.kuy_booking_url,
        trip_id = v_trip, trip_order = s.trip_order
      where id = s.id;
      if not found then raise exception 'Activity "%" tidak ditemukan.', s.title using hint = 'trip_missing'; end if;
      v_id := s.id;
    else
      insert into sessions (slug, title, type_slug, venue_id, starts_at, ends_at, capacity, sold_single, price, single_quota,
                            kuy_booking_url, trip_id, trip_order, status, visibility, points_per_attendance, waitlist_enabled, created_by, trip_key)
      values (s.slug, s.title, s.type_slug, s.venue_id, s.starts_at, s.ends_at, s.capacity, s.sold_single, s.price, s.single_quota,
              s.kuy_booking_url, v_trip, s.trip_order, r.status, r.visibility::session_visibility, 150, false, auth.uid(), a->>'key')
      returning id into v_id;
    end if;
    keep := keep || v_id;
    keymap := keymap || jsonb_build_object(a->>'key', v_id);
  end loop;

  -- Activity yang dikeluarkan dari daftar → lepas dari trip (sesinya tetap ada, peserta paket dikeluarkan).
  update sessions set trip_id = null, trip_order = null where trip_id = v_trip and not (id = any (keep));

  perform save_trip_rundown(v_trip, coalesce((
    select jsonb_agg(x.item || jsonb_build_object('session_id', keymap->>(x.item->>'activity_key')) order by x.ord)
    from jsonb_array_elements(coalesce(p_rundown, '[]'::jsonb)) with ordinality as x(item, ord)
  ), '[]'::jsonb));
  return v_trip;
end $$;
