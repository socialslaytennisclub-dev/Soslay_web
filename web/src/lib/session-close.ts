/**
 * Sesi tidak langsung ditutup tepat di jam selesai: ada jeda 30 menit untuk ronde terakhir,
 * input skor yang tertinggal, dan check-in telat. Selama jeda sesi tetap live (host masih bisa
 * Mulai Ronde, member masih bisa check-in); setelahnya sesi dianggap selesai walau host tidak
 * menekan "Akhiri Activity". Sama dengan fungsi SQL `session_closes_at` — ubah keduanya bersamaan
 * (scripts/check-migrations.mjs gagal bila durasinya berbeda).
 */
export const SESSION_CLOSE_GRACE_MS = 30 * 60_000;

/** Waktu sesi ditutup otomatis (ms epoch): jam selesai + jeda. */
export const sessionClosesAt = (endsAt: string | Date) => new Date(endsAt).getTime() + SESSION_CLOSE_GRACE_MS;

/** Untuk filter query: sesi belum ditutup pada `now` ⇔ `ends_at` > nilai ini (kebalikan sessionClosesAt). */
export const openSessionsEndAfter = (now: number) => new Date(now - SESSION_CLOSE_GRACE_MS).toISOString();
