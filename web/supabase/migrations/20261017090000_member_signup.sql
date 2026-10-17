-- Daftar member dari website (/daftar): akun Supabase Auth baru → baris profiles otomatis.
-- Hanya akun dengan metadata signup = 'member' (form daftar); undangan staf tidak ikut dibuatkan profil.

create function handle_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if meta->>'signup' is distinct from 'member' then
    return new;
  end if;

  insert into profiles (id, member_code, full_name, display_name, email, phone, birth_date, kuy_id)
  values (
    new.id,
    '',
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'display_name'), ''),
    new.email,
    nullif(regexp_replace(coalesce(meta->>'phone', ''), '\D', '', 'g'), ''),
    case when meta->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$' then (meta->>'birth_date')::date end,
    nullif(trim(meta->>'kuy_id'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_member_signup
  after insert on auth.users
  for each row execute function handle_member_signup();

-- Cek Kuy ID sebelum daftar (kolomnya unik) — tanpa membuka tabel profiles ke publik.
create function kuy_id_available(p_kuy_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where kuy_id = trim(p_kuy_id)::citext);
$$;

revoke all on function kuy_id_available(text) from public;
grant execute on function kuy_id_available(text) to anon, authenticated;
revoke all on function handle_member_signup() from public, anon, authenticated;
