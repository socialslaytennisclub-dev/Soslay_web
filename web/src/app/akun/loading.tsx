import { MemberSkeleton } from "@/components/member/MemberSkeleton/MemberSkeleton";

/** Masuk /akun dari luar: header profil + tab + isi menyusul. */
export default function Loading() {
  return <MemberSkeleton variant="tabs" />;
}
