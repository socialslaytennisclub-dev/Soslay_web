import { sessionClosesAt } from "./session-close";

/**
 * Kapan data peserta & absensi sebuah sesi tidak boleh dihapus lagi: begitu aktivitasnya
 * sudah dikerjakan — jam mulai lewat, sudah diakhiri/selesai, ada skor, atau ada peserta
 * yang check-in. Dipakai di UI (tombol nonaktif + alasan) dan dicek ulang di server.
 */
export type SessionLockInput = {
  startsAt: string | Date;
  status: string;
  endedAt: string | null;
  scoredMatches: number;
  checkedIn: number;
  now?: Date;
};

/** Diakhiri lewat "Akhiri Activity" (atau ditutup otomatis): completed / ended_at — tanpa melihat jam. */
export const isSessionEnded = ({ status, endedAt }: { status: string; endedAt: string | null }) => status === "completed" || Boolean(endedAt);

/**
 * Sesi selesai = diakhiri ("Akhiri Activity" → completed / ended_at) atau sudah ditutup otomatis
 * (jam selesai + jeda, lib/session-close) — sama dengan status "Selesai" di admin.
 */

export function isSessionFinished({ status, endedAt, endsAt, now = new Date() }: { status: string; endedAt: string | null; endsAt: string | Date; now?: Date }): boolean {
  if (isSessionEnded({ status, endedAt })) return true;
  return status === "published" && sessionClosesAt(endsAt) < now.getTime();
}

export function participantsLockReason({ startsAt, status, endedAt, scoredMatches, checkedIn, now = new Date() }: SessionLockInput): string | null {
  if (isSessionEnded({ status, endedAt })) return "Sesi sudah selesai — data peserta & absensi terkunci.";
  if (new Date(startsAt).getTime() <= now.getTime()) return "Sesi sudah dimulai — data peserta & absensi tidak bisa dihapus.";
  if (scoredMatches > 0) return "Sudah ada skor yang masuk — data peserta tidak bisa dihapus.";
  if (checkedIn > 0) return `${checkedIn} peserta sudah check-in — batalkan check-in dulu sebelum menghapus.`;
  return null;
}

/**
 * Boleh hapus satu peserta? Sebelum / selama activity: selama belum check-in dan belum masuk line-up
 * atau skor (pertandingan yang memuatnya ikut terhapus). Setelah activity selesai hanya baris tambahan
 * admin di daftar peserta (mis. dobel salah input) — impor Kuyy & booking sudah jadi catatan activity.
 */
export function participantRemoveLock({ trip, checkedIn, inMatch, finished, adminRow }: { trip: boolean; checkedIn: boolean; inMatch: boolean; finished: boolean; adminRow: boolean }): string | null {
  if (trip) return "Pembeli paket trip — batalkan paketnya di Peserta & pembayaran trip.";
  if (checkedIn) return "Sudah check-in — batalkan check-in dulu sebelum menghapus.";
  if (inMatch) return "Sudah masuk line-up / skor — atur ulang line-up dulu sebelum menghapus.";
  if (finished && !adminRow) return "Activity sudah selesai — hanya peserta tambahan admin yang belum check-in yang bisa dihapus.";
  return null;
}
