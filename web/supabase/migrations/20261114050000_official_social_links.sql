-- Akun resmi pindah ke @socialslayclub: link Instagram/Threads lama yang tersimpan di section CMS homepage
-- (CTA "Follow our Instagram" & post) diganti, supaya tidak menimpa link baru di kode.
update content_sections
set draft = replace(replace(draft::text, '"https://instagram.com/socialslay"', '"https://www.instagram.com/socialslayclub/"'), '"https://threads.net/@socialslay"', '"https://www.threads.com/@socialslayclub"')::jsonb,
    published = replace(replace(published::text, '"https://instagram.com/socialslay"', '"https://www.instagram.com/socialslayclub/"'), '"https://threads.net/@socialslay"', '"https://www.threads.com/@socialslayclub"')::jsonb
where draft::text like '%socialslay"%' or published::text like '%socialslay"%';
