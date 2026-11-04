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

/**
 * Sesi selesai = diakhiri ("Akhiri Activity" → completed / ended_at) atau, bila `endsAt` diberikan,
 * sudah ditutup otomatis (jam selesai + jeda, lib/session-close) — sama dengan status "Selesai" di admin.
 */
export function isSessionFinished({ status, endedAt, endsAt, now = new Date() }: { status: string; endedAt: string | null; endsAt?: string | Date; now?: Date }): boolean {
  if (status === "completed" || endedAt) return true;
  return status === "published" && endsAt !== undefined && sessionClosesAt(endsAt) < now.getTime();
}

export function participantsLockReason({ startsAt, status, endedAt, scoredMatches, checkedIn, now = new Date() }: SessionLockInput): string | null {
  if (isSessionFinished({ status, endedAt })) return "Sesi sudah selesai — data peserta & absensi terkunci.";
  if (new Date(startsAt).getTime() <= now.getTime()) return "Sesi sudah dimulai — data peserta & absensi tidak bisa dihapus.";
  if (scoredMatches > 0) return "Sudah ada skor yang masuk — data peserta tidak bisa dihapus.";
  if (checkedIn > 0) return `${checkedIn} peserta sudah check-in — batalkan check-in dulu sebelum menghapus.`;
  return null;
}
