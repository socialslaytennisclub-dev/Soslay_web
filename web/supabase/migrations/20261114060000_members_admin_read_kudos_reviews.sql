-- Detail member admin (tab Ringkasan & Review): admin Members juga boleh membaca kudos yang diberikan member
-- dan review yang ia tulis. Sebelumnya hanya admin Activities, sehingga admin Members melihat "Diberikan 0"
-- dan daftar review kosong. Agregat kudos yang diterima sudah lewat member_kudos (Activities / Members).
create policy "members admin read kudos" on kudos for select using (has_permission('members', 'view'));
create policy "members admin read reviews" on session_reviews for select using (has_permission('members', 'view'));
