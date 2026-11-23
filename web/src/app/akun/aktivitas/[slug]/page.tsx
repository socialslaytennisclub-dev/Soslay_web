import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/member/SessionDetail/SessionDetail";
import { getMySessionDetail } from "@/server/member/session-detail";

export async function generateMetadata({ params }: PageProps<"/akun/aktivitas/[slug]">): Promise<Metadata> {
  const detail = await getMySessionDetail((await params).slug);
  return { title: `${detail?.title ?? "Detail sesi"} — SOSLAY` };
}

/** Detail sesi peserta & host (Figma UIF-06 + Simplify): info, e-ticket & QR, peserta, live, leaderboard, ronde; setelah selesai hasil, foto & review. */
export default async function MemberSessionPage({ params }: PageProps<"/akun/aktivitas/[slug]">) {
  const { slug } = await params;
  const detail = await getMySessionDetail(slug);
  // Bukan peserta sesi ini (atau sesinya tidak ada) → 404, tanpa membocorkan bahwa sesinya ada.
  if (!detail) notFound();
  // Tab (?tab=) & notifikasi "baru diakhiri" (?ended=N) dibaca di browser (DetailTabs, EndedToast) — semua tab
  // dirender sekali, pindah tab tanpa muat ulang server.
  return <SessionDetail detail={detail} />;
}
