import { PageSkeleton } from "@/components/layout/PageSkeleton/PageSkeleton";

/** Kerangka saat pindah ke halaman ini sebelum isinya siap. */
export default function Loading() {
  return <PageSkeleton label="Memuat activity" />;
}
