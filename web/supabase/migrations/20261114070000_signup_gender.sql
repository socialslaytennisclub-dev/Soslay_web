-- Form daftar member kini menanyakan gender (Male / Female) → ikut metadata signup ke kolom profiles.gender.
-- Sama dengan versi 20261018010000_member_signup_admin_fields, ditambah gender.

create or replace function handle_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if meta->>'signup' is distinct from 'member' then
    return new;
  end if;

  insert into profiles (id, member_code, full_name, display_name, email, phone, birth_date, gender, kuy_id, city, tennis_level)
  values (
    new.id,
    '',
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'display_name'), ''),
    new.email,
    nullif(regexp_replace(coalesce(meta->>'phone', ''), '\D', '', 'g'), ''),
    case when meta->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$' then (meta->>'birth_date')::date end,
    case when meta->>'gender' in ('male', 'female') then (meta->>'gender')::gender end,
    nullif(trim(meta->>'kuy_id'), ''),
    nullif(trim(meta->>'city'), ''),
    case when meta->>'tennis_level' in ('beginner', 'beginner_intermediate', 'intermediate', 'intermediate_advanced', 'advanced')
      then (meta->>'tennis_level')::tennis_level end
  )
  on conflict (id) do nothing;
  return new;
end $$;

revoke all on function handle_member_signup() from public, anon, authenticated;
