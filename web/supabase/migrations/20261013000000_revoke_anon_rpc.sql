-- Fungsi khusus staf tidak perlu bisa dipanggil pengunjung tanpa login (anon).
-- Supabase memberi EXECUTE ke anon lewat default privileges; cabut eksplisit.
revoke execute on function my_admin_access() from anon;
revoke execute on function touch_staff_login() from anon;
