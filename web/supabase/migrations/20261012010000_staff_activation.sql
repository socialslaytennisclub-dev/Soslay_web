-- Staf yang diundang (status 'invited') menjadi 'active' saat pertama kali login, dan
-- last_active_at diperbarui setiap login. Dipanggil dari server action signIn.
create function touch_staff_login() returns void
language sql security definer set search_path = public as $$
  update staff_members
     set status = case when status = 'invited' then 'active'::staff_status else status end,
         last_active_at = now()
   where user_id = auth.uid() and status in ('invited', 'active');
$$;

revoke all on function touch_staff_login() from public;
grant execute on function touch_staff_login() to authenticated;
