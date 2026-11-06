-- Nama tipe sesi baru (teks saja, slug tetap): sama dengan activityTypes di src/content/activity.ts.
update activity_types set label = 'Mabar Session'    where slug = 'weekly-mabar';
update activity_types set label = 'Tennis Event'     where slug = 'match-day';
update activity_types set label = 'Coaching Session' where slug = 'beginner-coaching';
update activity_types set label = 'Tennis Social'    where slug = 'social';
