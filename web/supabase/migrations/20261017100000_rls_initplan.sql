-- Performa RLS: has_permission() & auth.uid() dibungkus (select …) supaya Postgres menghitungnya
-- sekali per query (initPlan), bukan sekali per baris. Logika policy tidak berubah.
-- Admin membaca ribuan baris (bookings, profiles, member_stats) — tanpa ini fungsi dipanggil per baris.

do $$
declare
  p record;
  wrap constant text := '(SELECT \&)';
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(has_permission\(|auth\.uid\(\))'
  loop
    new_qual := regexp_replace(regexp_replace(p.qual, 'has_permission\([^()]*\)', wrap, 'g'), 'auth\.uid\(\)', wrap, 'g');
    new_check := regexp_replace(regexp_replace(p.with_check, 'has_permission\([^()]*\)', wrap, 'g'), 'auth\.uid\(\)', wrap, 'g');
    if p.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, new_qual);
    end if;
    if p.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, new_check);
    end if;
  end loop;
end $$;
