-- Peserta boleh membaca sesi yang ia ikuti (booking aktif) — termasuk sesi visibilitas Link —
-- supaya halaman My Activities & detail sesi tetap jalan tanpa service role.
-- Daftar peserta lain sengaja TIDAK dibuka lewat RLS (berisi email / nomor HP).
create function is_session_member(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.session_id = p_session and b.member_id = auth.uid() and b.status <> 'cancelled'
  );
$$;
revoke execute on function is_session_member(uuid) from anon;

create policy "member read booked sessions" on sessions for select using (is_session_member(id));
