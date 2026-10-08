-- Akses admin milik user yang sedang login (nama, role, izin per modul).
-- SECURITY DEFINER: staf non-Settings (mis. Coach) tidak boleh membaca tabel roles /
-- role_permissions, tapi tetap perlu tahu izinnya sendiri untuk menampilkan menu admin.
create function my_admin_access()
returns table (full_name text, role_name text, permissions jsonb)
language sql stable security definer set search_path = public as $$
  select s.full_name,
         r.name,
         coalesce(jsonb_object_agg(rp.module, rp.access) filter (where rp.module is not null), '{}'::jsonb)
  from staff_members s
  join roles r on r.id = s.role_id
  left join role_permissions rp on rp.role_id = r.id
  where s.user_id = auth.uid() and s.status = 'active'
  group by s.full_name, r.name;
$$;

revoke all on function my_admin_access() from public;
grant execute on function my_admin_access() to authenticated;
