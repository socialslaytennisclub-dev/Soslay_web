import { redirect } from "next/navigation";

/** Link lama / pendek "Check-in Attendance" → halaman check-in member (wajib login). */
export default function AbsensiRedirect() {
  redirect("/akun/absensi");
}
