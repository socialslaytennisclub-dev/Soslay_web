import { MemberSkeleton } from "@/components/member/MemberSkeleton/MemberSkeleton";

/** Pindah tab (Dashboard · Profile · My Activities · Order): header & tab tetap, isi berupa kerangka. */
export default function Loading() {
  return <MemberSkeleton variant="list" />;
}
